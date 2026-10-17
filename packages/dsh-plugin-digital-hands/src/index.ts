/**
 * Digital Hands (数据手) — tool-management component for DeepSeek Harness.
 *
 * Responsibilities:
 *  1. Resolve the effective tool plan(s) (inline config, named YAML file, or
 *     the implicit `default.yml`).
 *  2. Mount every plan-declared managed MCP server: connect with the official
 *     SDK, register its tools as first-class native tools (direct invocation,
 *     no meta-tool indirection). A failed server is marked unavailable and
 *     never blocks the rest.
 *  3. Mount every plan-declared local script tool module.
 *  4. Register `tool_search` — a stable-schema catalog over BOTH the managed
 *     catalog (with rich per-tool docs from the plan) and every natively
 *     mounted tool visible through `ctx.tools.schemas()`. tool_search never
 *     changes the tool set; it only reads. Managed tools stay fully mounted
 *     and directly callable, so tool_search is navigation/documentation, not
 *     a gate.
 *  5. Provide the settings UI's backing services: a `digitalHandsService`
 *     (plan CRUD + capability delegation) and the `digitalHands` remote
 *     namespace (src-json, no generated artifacts) that the settings section
 *     calls through. Plan saves hot-reload the mounted set.
 *
 * Coexistence: this component does not touch the profile's official MCP
 * config, other plugins' registrations, or any agent preset. Tools mounted
 * the plain way (bundled + preset row) keep working untouched; this component
 * is just another registration source beside them.
 *
 * @module digital-hands
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DigitalHandsController } from './host/controller.ts'
import { DigitalHandsService } from './host/service.ts'
import type { DhToolRow } from './host/types.ts'
import { ManagedServer, probeServer } from './mcp.ts'
import { loadScriptTools } from './script-tools.ts'
import { resolvePlans, plansRoot, type DigitalHandsConfig, type ToolPlan } from './plan.ts'

export const inject = ['tools']

/** One entry of the managed catalog, for tool_search. */
interface ManagedEntry {
  readonly name: string
  readonly description: string
  readonly source: 'mcp' | 'script'
  readonly docs?: string
  readonly server?: string
}

const TOOL_SEARCH_NAME = 'tool_search'

export default async function apply(ctx: Context, config: DigitalHandsConfig): Promise<void> {
  // --- catalog state (rebuilt by each remount) ---
  const disposers: (() => void)[] = []
  const servers: ManagedServer[] = []
  const managed: ManagedEntry[] = []

  // --- settings service: mounted before anything can fail, so the UI works
  // even when every plan is broken ---
  const service = new DigitalHandsService()
  ctx.provide('digitalHandsService', service)
  ctx.plugin(DigitalHandsController)

  // --- tool_search: registered once; it reads whatever is currently mounted ---
  const toolSearch = defineTool({
    name: TOOL_SEARCH_NAME,
    description:
      'Search the tool catalog. Lists managed tools (MCP servers and script tools mounted by digital-hands) and every natively mounted tool, with extended usage docs when a tool has any. Pass query keywords to filter; omit query to list everything. Call this before using an unfamiliar managed tool when its description alone is not enough.',
    parameters: {
      query: { type: 'string', description: 'Space-separated keywords; a tool matches when every keyword hits its name, description, source or server name. Omit for the full catalog.' },
      source: { type: 'string', description: 'Filter: "managed" (digital-hands catalog), "native" (all other mounted tools), or "all" (default).' },
    },
    output: {
      schema: { type: 'json' } as const,
      render: (_args: unknown, value: unknown): { type: 'text'; text: string }[] =>
        [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute(args) {
      const { query, source } = args as { query?: string; source?: string }
      const wanted = source === 'managed' || source === 'native' ? source : 'all'
      const entries: { name: string; description: string; source: string; hasDocs: boolean; server?: string }[] = []

      if (wanted === 'all' || wanted === 'managed') {
        for (const entry of managed) {
          entries.push({
            name: entry.name,
            description: entry.description,
            source: entry.source,
            hasDocs: entry.docs !== undefined,
            ...(entry.server !== undefined ? { server: entry.server } : {}),
          })
        }
      }
      if (wanted === 'all' || wanted === 'native') {
        for (const schema of ctx.tools.schemas()) {
          if (schema.name === TOOL_SEARCH_NAME) continue
          if (managed.some((entry) => entry.name === schema.name)) continue
          entries.push({
            name: schema.name,
            description: schema.description ?? '',
            source: 'native',
            hasDocs: false,
          })
        }
      }

      const keywords = (query ?? '').toLowerCase().split(/\s+/).filter((word) => word !== '')
      const matched = keywords.length === 0
        ? entries
        : entries.filter((entry) => {
            const haystack = [
              entry.name,
              entry.description,
              entry.source,
              ...(entry.server !== undefined ? [entry.server] : []),
            ].join(' ').toLowerCase()
            return keywords.every((word) => haystack.includes(word))
          })

      return Promise.resolve({
        ok: true,
        total: matched.length,
        catalogSource: wanted,
        tools: matched,
        ...(matched.length === 0 && keywords.length > 0
          ? { note: '没有匹配的工具。去掉关键词看看完整目录，或换更宽泛的词。' }
          : {}),
      })
    },
  })
  disposers.push(ctx.tools.register(toolSearch))

  /** Tear down every managed registration and server connection. */
  const teardownManaged = (): void => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch {
        /* registry may already be tearing down; nothing to do */
      }
    }
    for (const server of servers.splice(0)) void server.dispose()
    managed.length = 0
  }
  ctx.effect(() => teardownManaged, 'digital-hands: registrations')

  /** Mount every plan-declared server and script. Re-entrant: callers must
   *  have torn the previous generation down first. */
  const mountPlans = async (): Promise<ToolPlan[]> => {
    const plans = await resolvePlans(config ?? {})
    service.activePlans = plans
      .filter((plan) => plan.servers.length > 0 || plan.scripts.length > 0)
      .map((plan) => plan.name)
    for (const plan of plans) {
      for (const spec of plan.servers) {
        const server = new ManagedServer(spec)
        servers.push(server)
        try {
          const count = await server.sync(ctx)
          ctx.logger.info('[digital-hands] MCP 服务器 %s 已挂载 %d 个工具。', spec.name, count)
          for (const record of server.records) {
            const docs = plan.docs?.[record.publicName]
            managed.push({
              name: record.publicName,
              description: record.description,
              source: 'mcp',
              server: spec.name,
              ...(docs !== undefined ? { docs } : {}),
            })
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          server.markFailed(message)
          ctx.logger.warn('[digital-hands] MCP 服务器 %s 挂载失败（已标记不可用）：%s', spec.name, message)
        }
      }

      for (const scriptSpec of plan.scripts) {
        try {
          const { definitions, records } = await loadScriptTools(scriptSpec.path)
          for (const definition of definitions) disposers.push(ctx.tools.register(definition))
          for (const record of records) {
            managed.push({
              name: record.name,
              description: record.description,
              source: 'script',
              ...(record.docs !== undefined ? { docs: record.docs } : {}),
            })
          }
          ctx.logger.info('[digital-hands] 脚本 %s 已挂载 %d 个工具。', scriptSpec.path, records.length)
        } catch (error) {
          ctx.logger.warn(
            '[digital-hands] 脚本 %s 挂载失败：%s',
            scriptSpec.path,
            error instanceof Error ? error.message : String(error),
          )
        }
      }
    }
    return plans
  }

  // --- capabilities the settings service delegates to ---
  const snapshot = (): { native: DhToolRow[]; managed: DhToolRow[] } => ({
    native: [...ctx.tools.schemas()]
      .filter((schema) => schema.name !== TOOL_SEARCH_NAME)
      .filter((schema) => !managed.some((entry) => entry.name === schema.name))
      .map((schema) => ({
        name: schema.name,
        description: schema.description ?? '',
        origin: 'native' as const,
      })),
    managed: managed.map((entry): DhToolRow => ({
      name: entry.name,
      description: entry.description,
      origin: entry.source,
      ...(entry.server !== undefined ? { server: entry.server } : {}),
      ...(entry.docs !== undefined ? { hasDocs: true } : {}),
    })),
  })
  service.attach({
    snapshot,
    mcpStatus: () => servers.map((server) => server.getStatus() as never),
    reload: async () => {
      teardownManaged()
      const plans = await mountPlans()
      ctx.logger.info(
        '[digital-hands] 热重载完成：%d 个受管工具（方案 %s）。',
        managed.length,
        plans.map((plan) => plan.name).join(', ') || '（无）',
      )
    },
    probe: (spec) => probeServer(spec as never),
  })

  // --- initial mount ---
  try {
    const plans = await mountPlans()
    ctx.logger.info(
      '[digital-hands] 初始化完成：%d 个受管工具（方案 %s）。方案目录：%s',
      managed.length,
      plans.map((plan) => plan.name).join(', ') || '（无）',
      plansRoot(),
    )
  } catch (error) {
    ctx.logger.warn(
      '[digital-hands] 方案加载失败，仅 tool_search 可用：%s',
      error instanceof Error ? error.message : String(error),
    )
  }
}
