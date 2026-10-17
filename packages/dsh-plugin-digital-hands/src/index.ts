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
import type { DhToolGroup, DhToolRow } from './host/types.ts'
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

/**
 * First-party tool catalog: tool name → owning official plugin, extracted
 * from the running dsh's `@deepseek-ai/dsh-tool-*` packages (0.2.1-rc.1).
 * The registry does not attribute registrations to their source plugin, so
 * the settings UI's source grouping uses this static catalog; anything it
 * does not cover falls into the unattributed third-party group.
 */
const OFFICIAL_PLUGINS: ReadonlyArray<{ title: string; plugin: string; tools: readonly string[] }> = [
  { title: '文件读写', plugin: 'dsh-tool-fs', tools: ['read', 'write', 'edit', 'read_image'] },
  { title: '文件搜索', plugin: 'dsh-tool-fs-search', tools: ['glob', 'grep'] },
  { title: 'Shell（bash）', plugin: 'dsh-tool-bash', tools: ['bash'] },
  { title: 'Shell（PowerShell）', plugin: 'dsh-tool-pwsh', tools: ['pwsh'] },
  { title: '终端会话', plugin: 'dsh-tool-terminal', tools: ['terminal_open', 'terminal_read', 'terminal_send', 'terminal_signal', 'terminal_list', 'terminal_close'] },
  { title: '网络访问', plugin: 'dsh-tool-web', tools: ['web_search', 'web_fetch'] },
  { title: '技能', plugin: 'dsh-tool-skill', tools: ['skill'] },
  { title: '待办清单', plugin: 'dsh-tool-todo', tools: ['todo_write'] },
  { title: '目标管理', plugin: 'dsh-tool-goal', tools: ['create_goal', 'get_goal', 'update_goal'] },
  { title: '后台任务', plugin: 'dsh-tool-jobs', tools: ['job_list', 'job_output', 'job_kill'] },
  { title: '定时计划', plugin: 'dsh-tool-schedule', tools: ['schedule_create', 'schedule_list', 'schedule_update', 'schedule_delete'] },
  { title: '会话查询', plugin: 'dsh-tool-session-query', tools: ['session_search', 'session_trace', 'session_event_read', 'session_event_search', 'session_event_trace'] },
  { title: '用户提问', plugin: 'dsh-tool-ask-user', tools: ['ask_user_question'] },
  { title: '内容展示', plugin: 'dsh-tool-present', tools: ['present'] },
  { title: '编辑器（str_replace）', plugin: 'dsh-tool-str-replace-editor', tools: ['str_replace_editor'] },
  { title: '子代理模型', plugin: 'dsh-tool-subagent', tools: ['list_subagent_models'] },
  { title: '子代理控制', plugin: 'dsh-tool-subagent-control', tools: ['interrupt_agent', 'send_message'] },
  { title: 'Ralph 循环', plugin: 'dsh-tool-ralph', tools: ['ralph'] },
  { title: '工作流', plugin: 'dsh-tool-workflow', tools: [] },
  { title: '工作目录', plugin: 'dsh-tool-working-directory', tools: ['working_directory'] },
  { title: '工作区依赖', plugin: 'dsh-tool-workspace-dependencies', tools: ['load_workspace_dependencies'] },
  { title: 'Cordis 检查', plugin: 'dsh-tool-cordis', tools: ['cordis_inspect_list', 'cordis_inspect_query'] },
  { title: 'MCP 资源', plugin: 'dsh-mcp-resources', tools: ['list_mcp_resources', 'read_mcp_resource', 'list_mcp_resource_templates'] },
]

/** tool name → its official plugin entry. */
const OFFICIAL_BY_TOOL: ReadonlyMap<string, { title: string; plugin: string }> = new Map(
  OFFICIAL_PLUGINS.flatMap((entry) => entry.tools.map((tool) => [tool, { title: entry.title, plugin: entry.plugin }] as const)),
)

/** Our own containers' loop tools (registered outside this plugin). */
function containerAttribution(name: string): { title: string; plugin: string } | undefined {
  if (name === 'loop_wakeup' || name.startsWith('cron_')) {
    return { title: 'Qwen 心跳循环', plugin: 'dsh-plugin-qwen-ability（loop）' }
  }
  return undefined
}

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
  /** Managed public names, for separating own registrations from native ones. */
  const managedNames = (): Set<string> => new Set(managed.map((entry) => entry.name))

  const buildGroups = (): DhToolGroup[] => {
    const groups: DhToolGroup[] = []

    // Self: tool_search + every plan-declared script tool.
    const selfTools: DhToolRow[] = [
      { name: TOOL_SEARCH_NAME, description: '目录检索：按关键词列出全部受管与原生工具（含扩展文档）。' },
      ...managed
        .filter((entry) => entry.source === 'script')
        .map((entry): DhToolRow => ({
          name: entry.name,
          description: entry.description,
          ...(entry.docs !== undefined ? { hasDocs: true } : {}),
        })),
    ]
    groups.push({ origin: 'self', title: '数据手', subtitle: 'dsh-plugin-digital-hands', tools: selfTools })

    // Managed MCP servers: one group per server, address as the subtitle.
    const claimed = managedNames()
    for (const server of servers) {
      const tools = managed
        .filter((entry) => entry.source === 'mcp' && entry.server === server.name)
        .map((entry): DhToolRow => ({ name: entry.name, description: entry.description }))
      groups.push({
        origin: 'mcp',
        title: server.name,
        subtitle: server.address(),
        tools,
      })
    }

    // Native (global-layer) tools: attribute via the first-party catalog.
    const attributed = new Map<string, DhToolRow[]>()
    const unknown: DhToolRow[] = []
    for (const schema of ctx.tools.schemas()) {
      if (schema.name === TOOL_SEARCH_NAME || claimed.has(schema.name)) continue
      const row: DhToolRow = { name: schema.name, description: schema.description ?? '' }
      const home = OFFICIAL_BY_TOOL.get(schema.name) ?? containerAttribution(schema.name)
      if (home === undefined) {
        unknown.push(row)
      } else {
        const bucket = attributed.get(home.plugin)
        if (bucket === undefined) attributed.set(home.plugin, [row])
        else bucket.push(row)
      }
    }
    for (const entry of OFFICIAL_PLUGINS) {
      const tools = attributed.get(entry.plugin)
      if (tools === undefined) continue
      groups.push({
        origin: 'official',
        title: entry.title,
        subtitle: `@deepseek-ai/${entry.plugin}`,
        tools: tools.sort((a, b) => (a.name < b.name ? -1 : 1)),
      })
    }
    if (unknown.length > 0) {
      groups.push({
        origin: 'third-party',
        title: '其他工具',
        subtitle: '第一方目录外的已挂载工具（来源未标注）',
        tools: unknown.sort((a, b) => (a.name < b.name ? -1 : 1)),
      })
    }
    return groups
  }

  service.attach({
    snapshot: () => ({ groups: buildGroups() }),
    managedCount: () => managed.length,
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
