/**
 * Managed MCP bridge for Digital Hands.
 *
 * Connects the plan-declared MCP servers with the official SDK (the same
 * `@modelcontextprotocol/client` package the harness's own dsh-mcp-client
 * uses), discovers their tools via `tools/list`, and registers each tool as a
 * first-class harness tool under the official naming contract — so managed
 * tools are called DIRECTLY by the model with full host-side approval,
 * timeout, cancellation, and error projection. No meta-tool indirection.
 *
 * Naming follows the harness's mcp-client Agent Note: the stable identity is
 * `(serverName, rawName)`; the public name is `mcp__<serverName>__<rawName>`,
 * normalized to the DeepSeek function-name contract (≤64 chars,
 * `[A-Za-z0-9_-]`) with a 12-hex SHA-256 identity hash appended on lossy
 * normalization so distinct MCP identities never collapse.
 *
 * v1 scope: no listChanged re-sync (a failed server is marked unavailable),
 * no durable image projection (image blocks degrade to a diagnostic text
 * line; the raw base64 stays available to programmatic callers via the
 * structured result), no credential scrubbing beyond dropping `DSH_*` env
 * names from the child environment.
 *
 * @module mcp
 */

import { createHash } from 'node:crypto'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import type { Context } from '@deepseek-ai/cordis'
import { type JsonSchemaNode, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { McpServerSpec } from './plan.ts'

/** DeepSeek function-name contract: at most 64 characters. */
const MAX_PUBLIC_NAME_LENGTH = 64
/** DeepSeek function-name contract: only `[A-Za-z0-9_-]` is allowed. */
const INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g
/** Hex chars of the SHA-256 identity hash appended on lossy normalization. */
const HASH_LENGTH = 12

/** Per-tool-call deadline (ms). The official client uses the same default. */
const TOOL_CALL_TIMEOUT_MS = 60_000

export interface ManagedToolRecord {
  readonly publicName: string
  readonly serverName: string
  readonly rawName: string
  readonly description: string
}

/** Deterministic public name for one `(serverName, rawName)` identity. */
function publicToolName(serverName: string, rawName: string): string {
  const joined = `mcp__${serverName}__${rawName}`
  const normalized = joined.replace(INVALID_NAME_CHARS, '_')
  if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized
  const hash = createHash('sha256').update(`${serverName}\0${rawName}`).digest('hex').slice(0, HASH_LENGTH)
  return `${normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1)}_${hash}`
}

/**
 * The subprocess environment: the parent env with credential-shaped and
 * stale `DSH_*` names dropped, plus the plan's explicit env. The MCP SDK
 * owns the actual spawn; this mirrors the official client's scrub intent
 * without depending on dsh-subprocess.
 */
function buildChildEnv(extra: Readonly<Record<string, string>>): Record<string, string> {
  const parent: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (key.startsWith('DSH_')) continue
    if (/(API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/i.test(key)) continue
    parent[key] = value
  }
  return { ...parent, ...extra }
}

/** Extract human-readable text from one MCP content array. */
function extractText(content: unknown, rawName: string): string {
  if (!Array.isArray(content)) return String(content ?? '')
  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const record = block as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string') {
      parts.push(record.text)
    } else if (record.type === 'image') {
      parts.push(`[image unavailable: ${String(record.mimeType ?? 'unknown media type')}; image projection not supported by digital-hands v1; raw data remains in the structured result]`)
    } else if (record.type === 'resource' || record.type === 'resource_link') {
      parts.push(`[resource: ${JSON.stringify(record)}]`)
    } else {
      parts.push(`[${String(record.type ?? 'unknown')} block]`)
    }
  }
  return parts.length > 0 ? parts.join('\n') : `[${rawName} returned an empty content array]`
}

/** Render callback shared by all managed MCP tool definitions. */
function mcpRender(rawName: string) {
  return (_args: unknown, value: unknown): { type: 'text'; text: string }[] => [
    {
      type: 'text',
      text: extractText((value as { content?: unknown } | null)?.content, rawName),
    },
  ]
}

/** One connected (or failed) managed MCP server. */
export class ManagedServer {
  readonly name: string
  private readonly spec: McpServerSpec
  private client: Client | undefined
  private state: 'idle' | 'connected' | 'failed' = 'idle'
  private failure = ''

  constructor(spec: McpServerSpec) {
    this.name = spec.name
    this.spec = spec
  }

  /** Human-readable endpoint for the settings UI: url, or the command line. */
  address(): string {
    return this.spec.transport === 'stdio'
      ? [this.spec.command ?? '', ...(this.spec.args ?? [])].join(' ').trim()
      : this.spec.url ?? ''
  }

  getStatus(): { name: string; state: string; failure?: string; tools: number } {
    return {
      name: this.name,
      state: this.state,
      ...(this.failure !== '' ? { failure: this.failure } : {}),
      tools: this.records.length,
    }
  }

  /** Tools registered by this server in its last successful sync. */
  readonly records: ManagedToolRecord[] = []

  /**
   * Connect and register the server's tools. Two phases keep the swap safe:
   * fetch (connect + listTools + build definitions) first — any failure
   * leaves the previous generation untouched — then dispose-old + register.
   * @param ctx plugin context carrying the `tools` service.
   * @returns the number of tools registered.
   */
  async sync(ctx: Context): Promise<number> {
    // Fetch phase.
    const client = new Client({ name: 'dsh-digital-hands', version: '0.1.0' })
    const transport = this.spec.transport === 'stdio'
      ? new StdioClientTransport({
          command: this.spec.command ?? '',
          args: [...(this.spec.args ?? [])],
          env: buildChildEnv(this.spec.env ?? {}),
          ...(this.spec.cwd !== undefined ? { cwd: this.spec.cwd } : {}),
        })
      : new StreamableHTTPClientTransport(new URL(this.spec.url ?? ''), {
          requestInit: { headers: { ...this.spec.headers } },
        })
    await client.connect(transport)
    const capabilities = client.getServerCapabilities()
    const listed = capabilities?.tools === undefined
      ? { tools: [] }
      : await client.listTools()

    const built = new Map<string, { definition: ToolDefinition; rawName: string; description: string }>()
    for (const tool of listed.tools) {
      const publicName = publicToolName(this.spec.name, tool.name)
      if (built.has(publicName)) {
        await client.close().catch(() => {})
        throw new Error(`server "${this.spec.name}" listed tool "${tool.name}" more than once — invalid tool list`)
      }
      built.set(publicName, buildDefinition({
        publicName,
        rawName: tool.name,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema,
        hasStructured: tool.outputSchema !== undefined,
        call: (args, signal) => client.callTool(
          { name: tool.name, arguments: args as Record<string, unknown> },
          { signal, timeout: TOOL_CALL_TIMEOUT_MS },
        ),
      }))
    }

    // Swap phase: replace the previous client and generation.
    await this.dispose()
    this.client = client
    this.records.length = 0
    let registered = 0
    for (const [publicName, entry] of built) {
      ctx.tools.register(entry.definition)
      registered += 1
      this.records.push({
        publicName,
        serverName: this.spec.name,
        rawName: entry.rawName,
        description: entry.description,
      })
    }
    this.state = 'connected'
    this.failure = ''
    return registered
  }

  /** Mark a failed sync/startup (the server stays listed but unavailable). */
  markFailed(reason: string): void {
    this.state = 'failed'
    this.failure = reason
  }

  async dispose(): Promise<void> {
    const client = this.client
    this.client = undefined
    this.records.length = 0
    if (client !== undefined) await client.close().catch(() => {})
    this.state = 'idle'
  }
}

interface DefinitionInput {
  readonly publicName: string
  readonly rawName: string
  readonly description: string
  readonly inputSchema: unknown
  readonly hasStructured: boolean
  call(args: unknown, signal: AbortSignal): Promise<unknown>
}

/**
 * Build one harness ToolDefinition from an upstream MCP tool.
 *
 * Constructed as a plain ToolDefinition literal (not via defineTool): the
 * registry's `parameters` field is `Record<string, unknown>` — raw MCP
 * JSON Schema passes straight through, exactly what the official
 * `createMcpToolDefinition` does. Executor semantics mirror the official
 * bridge: MCP isError results throw (so ToolRuntime records failure), text
 * is extracted for the model, structured content passes through when the
 * server declared an outputSchema.
 */
function buildDefinition(input: DefinitionInput): { definition: ToolDefinition; rawName: string; description: string } {
  const definition: ToolDefinition = {
    name: input.publicName,
    description: input.description,
    parameters: input.inputSchema as Record<string, unknown>,
    output: {
      schema: {
        type: 'object',
        properties: {
          content: { type: 'array', items: {} },
          ...(input.hasStructured ? { structuredContent: {} } : {}),
        },
        required: input.hasStructured ? ['content', 'structuredContent'] : ['content'],
        additionalProperties: false,
      } as JsonSchemaNode,
      render: mcpRender(input.rawName),
    },
    async execute(args, exec) {
      const raw = await input.call(args, exec.signal)
      const result = raw as { isError?: boolean; content?: unknown; structuredContent?: unknown }
      const text = extractText(result.content, input.rawName)
      if (result.isError === true) throw new Error(text)
      return {
        content: result.content ?? [],
        ...(result.structuredContent !== undefined ? { structuredContent: result.structuredContent } : {}),
      }
    },
  }
  return { definition, rawName: input.rawName, description: input.description }
}

/**
 * Probe a candidate server spec from the settings UI: connect, list tool
 * names, close. Nothing is registered — this only answers "does this server
 * come up and what would it provide".
 */
export async function probeServer(spec: McpServerSpec): Promise<{ ok: boolean; tools?: string[]; error?: string }> {
  const client = new Client({ name: 'dsh-digital-hands-probe', version: '0.1.0' })
  const transport = spec.transport === 'stdio'
    ? new StdioClientTransport({
        command: spec.command ?? '',
        args: [...(spec.args ?? [])],
        env: buildChildEnv(spec.env ?? {}),
        ...(spec.cwd !== undefined ? { cwd: spec.cwd } : {}),
      })
    : new StreamableHTTPClientTransport(new URL(spec.url ?? ''), {
        requestInit: { headers: { ...spec.headers } },
      })
  try {
    await client.connect(transport)
    const capabilities = client.getServerCapabilities()
    const listed = capabilities?.tools === undefined
      ? { tools: [] }
      : await client.listTools()
    return { ok: true, tools: listed.tools.map((tool) => tool.name) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    await client.close().catch(() => {})
  }
}
