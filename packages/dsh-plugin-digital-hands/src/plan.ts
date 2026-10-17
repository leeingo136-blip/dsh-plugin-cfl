/**
 * Tool plan loading for Digital Hands.
 *
 * A plan is a declarative bundle of tools the component should mount:
 *
 * ```yaml
 * name: my-plan
 * servers:
 *   - name: gitee
 *     transport: stdio
 *     command: npx
 *     args: ["-y", "@some/mcp-gitee"]
 *   - name: search
 *     transport: streamable-http
 *     url: http://127.0.0.1:8080/mcp
 *     headers: { Authorization: "Bearer ..." }
 * scripts:
 *   - path: ~/tools/quote-calc.js
 * docs:
 *   mcp__gitee__create_issue: |
 *     Extended usage notes, examples, caveats — surfaced via tool_search.
 * ```
 *
 * Plan resolution order (per component config):
 *  1. `config.plans` — inline plan objects (highest priority);
 *  2. `config.plan` — a named YAML file in `$DSH_HOME/digital-hands/plans/`;
 *  3. no config — `default.yml` in that directory, when present.
 *
 * @module plan
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { parse } from 'yaml'

export interface McpServerSpec {
  readonly name: string
  readonly transport: 'stdio' | 'streamable-http'
  readonly command?: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly url?: string
  readonly headers?: Readonly<Record<string, string>>
}

export interface ScriptSpec {
  /** Module path; `~` expands to the home directory. */
  readonly path: string
}

export interface ToolPlan {
  readonly name: string
  readonly servers: readonly McpServerSpec[]
  readonly scripts: readonly ScriptSpec[]
  /** Rich per-tool documentation surfaced through tool_search. */
  readonly docs?: Readonly<Record<string, string>>
}

/** Component config shape (from the patch row's `config:` block). */
export interface DigitalHandsConfig {
  readonly plan?: string
  readonly plans?: readonly ToolPlan[]
}

/** Valid MCP server name: stable namespace, must survive `mcp__<name>__`. */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  return path
}

export function resolveHomePath(path: string): string {
  const expanded = expandHome(path)
  return isAbsolute(expanded) ? expanded : resolve(expanded)
}

/** The plans root: `$DSH_HOME/digital-hands/plans` (DSH_HOME defaults to ~/.dsh). */
export function plansRoot(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'digital-hands', 'plans')
}

/** Parse and validate one plan document (YAML string or inline object). */
export function parsePlan(input: unknown, source: string): ToolPlan {
  const raw = (typeof input === 'string' ? parse(input) : input) as Record<string, unknown> | null
  if (raw === null || typeof raw !== 'object') throw new Error(`方案 ${source} 不是有效的 YAML 映射。`)

  const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : source

  const servers: McpServerSpec[] = []
  if (raw.servers !== undefined) {
    if (!Array.isArray(raw.servers)) throw new Error(`方案 ${source} 的 servers 必须是数组。`)
    for (const entry of raw.servers) {
      const spec = entry as Record<string, unknown>
      const serverName = spec.name
      if (typeof serverName !== 'string' || !SERVER_NAME_PATTERN.test(serverName)) {
        throw new Error(`方案 ${source} 的某个 server.name 无效（需匹配 ${SERVER_NAME_PATTERN.source}）：${String(serverName)}`)
      }
      const transport = spec.transport
      if (transport === 'stdio') {
        if (typeof spec.command !== 'string' || spec.command === '') {
          throw new Error(`方案 ${source} 的 server "${serverName}"（stdio）缺少 command。`)
        }
        const env = isStringDict(spec.env) ?? {}
        servers.push({
          name: serverName,
          transport,
          command: spec.command,
          args: Array.isArray(spec.args) ? spec.args.map(String) : [],
          env,
          ...(typeof spec.cwd === 'string' && spec.cwd !== '' ? { cwd: spec.cwd } : {}),
        })
      } else if (transport === 'streamable-http') {
        if (typeof spec.url !== 'string' || spec.url === '') {
          throw new Error(`方案 ${source} 的 server "${serverName}"（streamable-http）缺少 url。`)
        }
        const headers = isStringDict(spec.headers) ?? {}
        servers.push({
          name: serverName,
          transport,
          url: spec.url,
          headers,
        })
      } else {
        throw new Error(`方案 ${source} 的 server "${serverName}" transport 必须是 stdio 或 streamable-http。`)
      }
    }
  }

  const scripts: ScriptSpec[] = []
  if (raw.scripts !== undefined) {
    if (!Array.isArray(raw.scripts)) throw new Error(`方案 ${source} 的 scripts 必须是数组。`)
    for (const entry of raw.scripts) {
      const spec = entry as Record<string, unknown>
      if (typeof spec.path !== 'string' || spec.path === '') {
        throw new Error(`方案 ${source} 的某个 script 缺少 path。`)
      }
      scripts.push({ path: spec.path })
    }
  }

  const parsedDocs = isStringDict(raw.docs)
  return { name, servers, scripts, ...(parsedDocs === undefined ? {} : { docs: parsedDocs }) }
}

function isStringDict(value: unknown): Record<string, string> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== 'string') return undefined
    out[key] = entry
  }
  return out
}

/** Load one named plan file (no extension or `.yml`/`.yaml`) from the plans root. */
export async function loadNamedPlan(plan: string): Promise<ToolPlan> {
  const base = join(plansRoot(), plan)
  for (const candidate of [`${base}.yml`, `${base}.yaml`, base]) {
    let text: string
    try {
      text = await readFile(candidate, 'utf8')
    } catch {
      continue
    }
    return parsePlan(text, plan)
  }
  throw new Error(`找不到方案文件：${plansRoot()}/${plan}.yml（也在 ${plansRoot()} 下尝试了 .yaml 与无后缀名）。`)
}

/**
 * Resolve the effective plan set for a component config.
 * Inline `config.plans` win over the named `config.plan`; with neither,
 * `default.yml` is used when it exists. Never throws for the no-config case —
 * an empty catalog is a valid (tool_search-only) deployment.
 */
export async function resolvePlans(config: DigitalHandsConfig): Promise<ToolPlan[]> {
  if (config.plans !== undefined && config.plans.length > 0) {
    return config.plans.map((plan, index) => parsePlan(plan, `inline#${index}`))
  }
  if (config.plan !== undefined && config.plan !== '') return [await loadNamedPlan(config.plan)]
  try {
    return [await loadNamedPlan('default')]
  } catch {
    return []
  }
}
