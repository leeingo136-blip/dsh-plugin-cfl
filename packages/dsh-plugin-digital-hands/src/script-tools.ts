/**
 * Local script tools for Digital Hands.
 *
 * A script tool is an ES module exporting tool definitions in the harness
 * ToolDefinition shape (the same fields `defineTool` produces):
 *
 * ```js
 * export default {
 *   name: 'quote_calc',
 *   description: 'Compute a quoted price from material lines.',
 *   parameters: { type: 'object', properties: { lines: { type: 'array' } }, required: ['lines'] },
 *   output: {
 *     schema: { type: 'object' },
 *     render: (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
 *   },
 *   async execute(args, exec) { return { ok: true, total: 42 } },
 * }
 * ```
 *
 * Export one definition (or an array of them) as `default`, or an array
 * under a named `tools` export. A `docs` string field (extra, not part of
 * ToolDefinition) is surfaced via tool_search as rich documentation.
 *
 * For convenience, a minimal `{name, description, execute, parameters?, docs?}`
 * plain object is accepted too: the wrapper fills in a JSON-passthrough
 * output definition, and `parameters` may be either a raw JSON Schema
 * object or the per-property DSL map (forwarded as-is — the registry
 * accepts the raw JSON Schema shape; DSL maps are what defineTool compiles
 * from, and the same per-property map shape is accepted by the registry's
 * argument validator).
 *
 * @module script-tools
 */

import { pathToFileURL } from 'node:url'
import { resolveHomePath } from './plan.ts'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

export interface ScriptToolRecord {
  readonly name: string
  readonly description: string
  readonly sourcePath: string
  readonly docs?: string
}

/** Minimal plain-object shape accepted for wrapping. */
interface MinimalSpec {
  readonly name: string
  readonly description: string
  readonly parameters?: unknown
  readonly docs?: string
  execute(args: unknown, exec: unknown): unknown
}

/** JSON-passthrough output shared by wrapped minimal specs. */
function jsonOutput(): ToolDefinition['output'] {
  return {
    schema: { type: 'object', properties: {} } as ToolDefinition['output']['schema'],
    render: (_args: unknown, value: unknown): { type: 'text'; text: string }[] =>
      [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }
}

/** True when the value already looks like a full harness ToolDefinition. */
function isFullDefinition(value: object): boolean {
  return 'output' in value && 'execute' in value && 'name' in value && 'description' in value
}

/** Normalize one loaded module into definition/record pairs. */
function extract(module: unknown, sourcePath: string): { definitions: ToolDefinition[]; records: ScriptToolRecord[] } {
  const specs: unknown[] = []
  if (module !== null && typeof module === 'object') {
    const record = module as Record<string, unknown>
    if (record.default !== undefined) specs.push(...(Array.isArray(record.default) ? record.default : [record.default]))
    if (record.tools !== undefined) specs.push(...(Array.isArray(record.tools) ? record.tools : [record.tools]))
  }

  const definitions: ToolDefinition[] = []
  const records: ScriptToolRecord[] = []
  for (const spec of specs) {
    if (spec === null || typeof spec !== 'object') continue
    const record = spec as Record<string, unknown>
    const docs = typeof record.docs === 'string' ? record.docs : undefined

    if (isFullDefinition(record)) {
      definitions.push(record as unknown as ToolDefinition)
      records.push({
        name: record.name as string,
        description: record.description as string,
        sourcePath,
        ...(docs !== undefined ? { docs } : {}),
      })
      continue
    }

    if (typeof record.name !== 'string' || typeof record.execute !== 'function') {
      throw new Error(`脚本 ${sourcePath} 导出的某个工具缺少 name 或 execute。`)
    }
    const minimal: MinimalSpec = {
      name: record.name,
      description: typeof record.description === 'string' ? record.description : '',
      ...(record.parameters !== undefined ? { parameters: record.parameters } : {}),
      execute: record.execute as MinimalSpec['execute'],
    }
    definitions.push({
      name: minimal.name,
      description: minimal.description,
      parameters: (minimal.parameters ?? { type: 'object', properties: {} }) as Record<string, unknown>,
      output: jsonOutput(),
      execute: (args, exec) => Promise.resolve(minimal.execute(args, exec)),
    })
    records.push({
      name: minimal.name,
      description: minimal.description,
      sourcePath,
      ...(docs !== undefined ? { docs } : {}),
    })
  }
  return { definitions, records }
}

/** Load one script module and return its definitions (unregistered) + records. */
export async function loadScriptTools(path: string): Promise<{
  definitions: ToolDefinition[]
  records: ScriptToolRecord[]
}> {
  const resolved = resolveHomePath(path)
  const module = await import(`${pathToFileURL(resolved).href}?t=${Date.now()}`)
  return extract(module, path)
}
