/**
 * Digital Hands settings section: the browser half of the settings UI.
 *
 * Registers one `settings.section` slot entry (the same seat the account hub
 * uses) with three views: the tool catalog (every mounted tool with origin),
 * the managed MCP servers (live status + an add-server form that probes
 * before saving), and the plan editor (create / view / edit / delete YAML
 * plan files, saved through the host service with a hot reload).
 *
 * All styling is inline against the stock dsw alias variables so the section
 * tracks the active theme without a CSS-module build step.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

// Type-only imports: the runtime seam is the injected `remote.digitalHands`
// namespace mounted by @dsh/dh-mount.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/cordis'

/** One tool entry inside a source group. */
interface ToolRow {
  name: string
  description: string
  hasDocs?: boolean
  /** Catalog-only: loads inside preset scopes, not mounted in this plugin's layer. */
  presetScoped?: boolean
}

/** One source group: a plugin, a managed MCP server, or digital-hands itself. */
interface ToolGroup {
  origin: 'self' | 'mcp' | 'official' | 'third-party'
  title: string
  subtitle: string
  tools: ToolRow[]
}

/** One managed server's live status. */
interface McpStatus {
  name: string
  state: 'idle' | 'connected' | 'failed'
  tools: number
  failure?: string
}

/** One plan file. */
interface PlanView {
  name: string
  yaml: string
  active: boolean
  servers: number
  scripts: number
}

interface ProbeResult {
  ok: boolean
  tools?: string[]
  error?: string
}

/** The face injected into the section component. */
interface DhFace {
  listTools(): Promise<{ groups: ToolGroup[] }>
  listPlans(): Promise<PlanView[]>
  savePlan(name: string, yaml: string): Promise<void>
  deletePlan(name: string): Promise<void>
  status(): Promise<{ mcp: McpStatus[]; activePlans: string[]; managedTools: number }>
  testMcp(spec: Record<string, unknown>): Promise<ProbeResult>
}

type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { message: string } }

/** Unwrap one remote envelope; throw the host's message on failure. */
async function call<T>(promise: Promise<RemoteResult<T>>): Promise<T> {
  const result = await promise
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

// --- styles ---------------------------------------------------------------

const section: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }
const card: React.CSSProperties = {
  border: '0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-default, #e2e2e2))',
  borderRadius: 'var(--dsw-radius-xl, 12px)',
  background: 'var(--dsw-alias-settings-card-fill, var(--dsw-alias-surface-default, transparent))',
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}
const head: React.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 10 }
const title: React.CSSProperties = { color: 'var(--dsw-alias-text-primary)', fontSize: 14, fontWeight: 600, margin: 0 }
const hint: React.CSSProperties = { color: 'var(--dsw-alias-text-secondary)', margin: 0, fontSize: 12 }
const muted: React.CSSProperties = { color: 'var(--dsw-alias-text-tertiary, var(--dsw-alias-text-secondary))', margin: 0, fontSize: 12 }
const errorText: React.CSSProperties = { color: 'var(--dsw-alias-text-danger, var(--dsw-ref-red-600, #cf222e))', margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }
const okText: React.CSSProperties = { color: 'var(--dsw-alias-text-success, var(--dsw-ref-green-600, #1a7f37))', margin: 0, fontSize: 12 }
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const input: React.CSSProperties = {
  height: 30,
  border: '1px solid var(--dsw-alias-border-default, var(--dsw-ref-neutral-200, #e2e2e2))',
  borderRadius: 8,
  background: 'var(--dsw-alias-surface-default, transparent)',
  color: 'var(--dsw-alias-text-primary)',
  padding: '0 8px',
  fontSize: 13,
}
const button: React.CSSProperties = {
  height: 30,
  border: '0.5px solid var(--dsw-alias-border-default, var(--dsw-ref-neutral-200, #e2e2e2))',
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary, var(--dsw-alias-text-primary))',
  padding: '0 12px',
  fontSize: 13,
  cursor: 'pointer',
}
const primaryButton: React.CSSProperties = {
  ...button,
  background: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-text-primary))',
  color: 'var(--dsw-alias-label-primary-foreground, #fff)',
  borderColor: 'transparent',
  fontWeight: 500,
}
const tabRow: React.CSSProperties = { display: 'flex', gap: 4 }
const tab = (active: boolean): React.CSSProperties => ({
  ...button,
  border: 'none',
  fontWeight: active ? 600 : 400,
  background: active ? 'var(--dsw-alias-interactive-bg-hover, #8080801a)' : 'transparent',
})
const select: React.CSSProperties = { ...input, cursor: 'pointer' }
const textarea: React.CSSProperties = {
  width: '100%',
  minHeight: 320,
  boxSizing: 'border-box',
  border: '1px solid var(--dsw-alias-border-default, var(--dsw-ref-neutral-200, #e2e2e2))',
  borderRadius: 8,
  background: 'var(--dsw-alias-surface-default, transparent)',
  color: 'var(--dsw-alias-text-primary)',
  padding: 10,
  fontSize: 12.5,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  lineHeight: 1.55,
  resize: 'vertical',
}

const NEW_PLAN_TEMPLATE = `# Digital Hands 方案：声明受管 MCP 服务器与脚本工具。
# servers: 每条一个 MCP 服务器（transport: streamable-http 需要 url，stdio 需要 command/args）。
# scripts: 每条一个本地 ES 模块（导出工具定义）。
# docs: 可选，工具名 -> 富文本说明，tool_search 会展示。
name: new-plan
servers: []
scripts: []
docs: {}
`

/** Append one server block to a plan YAML's `servers:` list (JSON scalars
 *  are valid YAML, so JSON.stringify quotes every string safely). */
function appendServer(yaml: string, spec: Record<string, string>): string {
  const lines: string[] = []
  const push = (key: string, value: string): void => { lines.push(`    ${key}: ${JSON.stringify(value)}`) }
  push('name', spec.name)
  push('transport', spec.transport)
  if (spec.transport === 'streamable-http') {
    push('url', spec.url)
    if (spec.headers !== '') {
      for (const pair of spec.headers.split('\n')) {
        const idx = pair.indexOf(':')
        if (idx > 0) lines.push(`    ${pair.slice(0, idx).trim()}: ${JSON.stringify(pair.slice(idx + 1).trim())}`)
      }
    }
  } else {
    push('command', spec.command)
    for (const arg of spec.args.split(/\s+/).filter((a) => a !== '')) {
      lines.push(`    - ${JSON.stringify(arg)}`)
    }
  }
  const block = lines.join('\n')
  if (/^servers:\s*\[\s*\]?\s*$/m.test(yaml)) {
    // Replace the empty-list shorthand with a real list.
    return yaml.replace(/^servers:[^\n]*$/m, 'servers:\n  - ' + block.split('\n').join('\n    ').replace(/^ {4}/, ''))
  }
  if (/^servers:\s*$/m.test(yaml)) {
    return yaml.replace(/^servers:\s*$/m, `servers:\n  ${block.split('\n').join('\n    ')}`)
  }
  // No servers key at all: append one.
  return `${yaml.replace(/\s*$/, '')}\nservers:\n  ${block.split('\n').join('\n    ')}\n`
}

// --- the section ----------------------------------------------------------

/** Services required by the section (client fiber inject). */
const inject = ['slots', 'remote', 'remote.digitalHands']

function apply(ctx: {
  slots: {
    inject(slot: string, factory: () => unknown): void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  remote: Record<string, unknown>
}): void {
  const remote = ctx.remote as unknown as {
    digitalHands: {
      listTools(): Promise<RemoteResult<{ groups: ToolGroup[] }>>
      listPlans(): Promise<RemoteResult<PlanView[]>>
      savePlan(name: string, yaml: string): Promise<RemoteResult<{ reloaded: boolean }>>
      deletePlan(name: string): Promise<RemoteResult<{ reloaded: boolean }>>
      status(): Promise<RemoteResult<{ mcp: McpStatus[]; activePlans: string[]; managedTools: number }>>
      testMcp(spec: Record<string, unknown>): Promise<RemoteResult<ProbeResult>>
    }
  }

  const face: DhFace = {
    listTools: () => call(remote.digitalHands.listTools()),
    listPlans: () => call(remote.digitalHands.listPlans()),
    savePlan: async (name, yaml) => {
      await call(remote.digitalHands.savePlan(name, yaml))
    },
    deletePlan: async (name) => {
      await call(remote.digitalHands.deletePlan(name))
    },
    status: () => call(remote.digitalHands.status()),
    testMcp: (spec) => call(remote.digitalHands.testMcp(spec)),
  }

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'digital-hands',
        order: -9,
        label: () => '数据手',
        inject: () => ({ face }),
      },
      DigitalHandsSection,
    ),
  )
}

/** The section, or null while the shell has not injected the face yet. */
function DigitalHandsSection(props: { face?: DhFace }): ReactNode {
  const { face } = props
  // NOTE: the state name must not shadow the `tab` style helper above —
  // a previous `const [tab, setTab]` made `style={tab(...)}` call a string.
  const [activeTab, setActiveTab] = useState<'tools' | 'mcp' | 'plans'>('tools')
  if (face === undefined) return null
  return (
    <div style={section}>
      <div style={tabRow}>
        <button type="button" style={tab(activeTab === 'tools')} onClick={() => setActiveTab('tools')}>工具列表</button>
        <button type="button" style={tab(activeTab === 'mcp')} onClick={() => setActiveTab('mcp')}>MCP 服务器</button>
        <button type="button" style={tab(activeTab === 'plans')} onClick={() => setActiveTab('plans')}>方案</button>
      </div>
      {activeTab === 'tools' ? <ToolsView face={face} /> : activeTab === 'mcp' ? <McpView face={face} /> : <PlansView face={face} />}
    </div>
  )
}

// --- tools view -----------------------------------------------------------

const badge: React.CSSProperties = {
  fontSize: 11,
  lineHeight: '16px',
  padding: '0 8px',
  borderRadius: 999,
  border: '0.5px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-default, #e2e2e2))',
  whiteSpace: 'nowrap',
}
const BADGES: Record<ToolGroup['origin'], { label: string; style: React.CSSProperties }> = {
  official: { label: '第一方插件', style: badge },
  'third-party': { label: '第三方插件', style: { ...badge, color: 'var(--dsw-alias-text-secondary)' } },
  mcp: { label: 'MCP', style: { ...badge, color: 'var(--dsw-alias-text-success, var(--dsw-ref-green-600, #1a7f37))' } },
  self: { label: '第三方插件', style: { ...badge, color: 'var(--dsw-alias-text-secondary)' } },
}
const toolList: React.CSSProperties = { display: 'flex', flexDirection: 'column' }
const toolLine: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  padding: '5px 0',
  borderBottom: '0.5px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-default, #e2e2e2))',
  alignItems: 'baseline',
}
const toolName: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12.5,
  color: 'var(--dsw-alias-text-primary)',
  minWidth: 220,
  flexShrink: 0,
}
const toolDesc: React.CSSProperties = { color: 'var(--dsw-alias-text-secondary)', fontSize: 12.5, minWidth: 0 }

function ToolsView({ face }: { face: DhFace }): ReactNode {
  const [groups, setGroups] = useState<ToolGroup[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    face.listTools().then((value) => {
      setGroups(value.groups)
      setError(null)
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }, [face])
  useEffect(refresh, [refresh])

  if (error !== null) return <div style={card}><p style={errorText}>加载失败：{error}</p></div>
  if (groups === null) return <div style={card}><p style={muted}>加载中…</p></div>
  // Defensive: a torn-down/mid-boot remote can resolve with a missing list —
  // render the empty state instead of crashing the whole settings shell.
  const list = Array.isArray(groups) ? groups : []
  const total = list.reduce((sum, group) => sum + group.tools.length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...row, paddingLeft: 2 }}>
        <span style={muted}>{list.length} 个来源 · {total} 个工具</span>
        <span style={{ flex: 1 }} />
        <button type="button" style={button} onClick={refresh}>刷新</button>
      </div>
      {list.map((group) => (
        <div key={`${group.origin}:${group.title}`} style={{ ...card, gap: 6 }}>
          <div style={head}>
            <h3 style={title}>{group.title}</h3>
            <span style={BADGES[group.origin].style}>{BADGES[group.origin].label}</span>
            <span style={{ flex: 1 }} />
            <span style={muted}>{group.tools.length} 个工具</span>
          </div>
          <p style={muted}>{group.subtitle}</p>
          <div style={toolList}>
            {group.tools.map((tool) => (
              <div key={tool.name} style={toolLine}>
                <span style={tool.presetScoped === true ? { ...toolName, color: 'var(--dsw-alias-text-secondary)' } : toolName}>
                  {tool.name}{tool.hasDocs === true ? ' ·' : ''}
                </span>
                <span style={toolDesc}>
                  {tool.description}
                  {tool.presetScoped === true ? `${tool.description ? ' · ' : ''}随预设作用域加载` : null}
                </span>
              </div>
            ))}
            {group.tools.length === 0 && <p style={muted}>该来源当前没有可用工具。</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

// --- MCP view -------------------------------------------------------------

const EMPTY_FORM = { name: '', transport: 'streamable-http', url: '', command: '', args: '', headers: '' }

function McpView({ face }: { face: DhFace }): ReactNode {
  const [status, setStatus] = useState<{ mcp: McpStatus[]; activePlans: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [targetPlan, setTargetPlan] = useState('default')

  const refresh = useCallback(() => {
    face.status().then((value) => {
      setStatus(value)
      setError(null)
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }, [face])
  useEffect(refresh, [refresh])

  const spec = (): Record<string, unknown> => {
    const base: Record<string, unknown> = { name: form.name.trim(), transport: form.transport }
    if (form.transport === 'streamable-http') {
      base.url = form.url.trim()
      const headers: Record<string, string> = {}
      for (const pair of form.headers.split('\n')) {
        const idx = pair.indexOf(':')
        if (idx > 0) headers[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim()
      }
      if (Object.keys(headers).length > 0) base.headers = headers
    } else {
      base.command = form.command.trim()
      base.args = form.args.split(/\s+/).filter((a) => a !== '')
    }
    return base
  }

  const runProbe = (): void => {
    if (form.name.trim() === '') { setProbe({ ok: false, error: '先填服务器名。' }); return }
    setBusy(true)
    setProbe(null)
    face.testMcp(spec()).then((value) => {
      setProbe(value)
    }).catch((cause: unknown) => {
      setProbe({ ok: false, error: cause instanceof Error ? cause.message : String(cause) })
    }).finally(() => {
      setBusy(false)
    })
  }

  const saveToPlan = (): void => {
    if (probe?.ok !== true) { setNotice('请先测试连接成功再保存。'); return }
    setBusy(true)
    setNotice(null)
    face.listPlans().then(async (plans) => {
      const existing = plans.find((p) => p.name === targetPlan)
      const yaml = appendServer(existing?.yaml ?? NEW_PLAN_TEMPLATE.replace('name: new-plan', `name: ${targetPlan}`), {
        name: form.name.trim(),
        transport: form.transport,
        ...(form.transport === 'streamable-http'
          ? { url: form.url.trim(), headers: form.headers }
          : { command: form.command.trim(), args: form.args }),
      })
      await face.savePlan(targetPlan, yaml)
      setNotice(`已写入方案「${targetPlan}」并热重载。`)
      setForm({ ...EMPTY_FORM })
      setProbe(null)
      refresh()
    }).catch((cause: unknown) => {
      setNotice(`保存失败：${cause instanceof Error ? cause.message : String(cause)}`)
    }).finally(() => {
      setBusy(false)
    })
  }

  return (
    <>
      <div style={card}>
        <div style={head}>
          <h3 style={title}>受管 MCP 服务器</h3>
          <span style={{ flex: 1 }} />
          <button type="button" style={button} onClick={refresh}>刷新</button>
        </div>
        {error !== null && <p style={errorText}>加载失败：{error}</p>}
        {status === null && error === null && <p style={muted}>加载中…</p>}
        {status !== null && status.mcp.length === 0 && <p style={muted}>当前没有受管 MCP 服务器。在下方添加，或在方案里声明。</p>}
        {status !== null && status.mcp.map((server) => (
          <div key={server.name} style={row}>
            <span style={{ ...title, fontWeight: 500 }}>{server.name}</span>
            <span style={server.state === 'connected' ? okText : server.state === 'failed' ? errorText : muted}>
              {server.state === 'connected' ? `已连接 · ${server.tools} 个工具` : server.state === 'failed' ? `失败：${server.failure ?? ''}` : '未连接'}
            </span>
          </div>
        ))}
        {status !== null && <p style={hint}>激活方案：{status.activePlans.join('、') || '（无）'}</p>}
      </div>
      <div style={card}>
        <h3 style={title}>添加 MCP 服务器</h3>
        <p style={hint}>先测试连接，成功后写入方案并自动热重载（模型即可直接调用其工具）。</p>
        <div style={row}>
          <input style={{ ...input, width: 180 }} placeholder="服务器名（英文）" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select style={{ ...select, width: 170 }} value={form.transport}
            onChange={(e) => setForm({ ...form, transport: e.target.value })}>
            <option value="streamable-http">Streamable HTTP（url）</option>
            <option value="stdio">stdio（本地命令）</option>
          </select>
          <select style={{ ...select, width: 160 }} value={targetPlan} onChange={(e) => setTargetPlan(e.target.value)}>
            <option value="default">方案：default</option>
            <option value="mcp">方案：mcp</option>
          </select>
        </div>
        {form.transport === 'streamable-http' ? (
          <>
            <input style={{ ...input, width: '100%', boxSizing: 'border-box' }} placeholder="https://example.com/mcp" value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <textarea style={{ ...textarea, minHeight: 52 }} placeholder="请求头（可选，每行 Key: Value）" value={form.headers}
              onChange={(e) => setForm({ ...form, headers: e.target.value })} />
          </>
        ) : (
          <div style={row}>
            <input style={{ ...input, flex: 1, minWidth: 220 }} placeholder="命令，如 npx" value={form.command}
              onChange={(e) => setForm({ ...form, command: e.target.value })} />
            <input style={{ ...input, flex: 2, minWidth: 220 }} placeholder="参数（空格分隔），如 -y @some/mcp-server" value={form.args}
              onChange={(e) => setForm({ ...form, args: e.target.value })} />
          </div>
        )}
        <div style={row}>
          <button type="button" style={button} disabled={busy} onClick={runProbe}>{busy ? '测试中…' : '测试连接'}</button>
          <button type="button" style={primaryButton} disabled={busy || probe?.ok !== true} onClick={saveToPlan}>保存到方案</button>
        </div>
        {probe !== null && (probe.ok
          ? <p style={okText}>连接成功，{probe.tools?.length ?? 0} 个工具：{probe.tools?.join('、') || '（无）'}</p>
          : <p style={errorText}>连接失败：{probe.error}</p>)}
        {notice !== null && <p style={muted}>{notice}</p>}
      </div>
    </>
  )
}

// --- plans view -----------------------------------------------------------

function PlansView({ face }: { face: DhFace }): ReactNode {
  const [plans, setPlans] = useState<PlanView[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback((keep?: string) => {
    face.listPlans().then((value) => {
      setPlans(value)
      setError(null)
      setSelected((current) => {
        const target = keep ?? current
        if (target !== null && value.some((p) => p.name === target)) {
          setDraft(value.find((p) => p.name === target)?.yaml ?? '')
          return target
        }
        setDraft(value[0]?.yaml ?? '')
        return value[0]?.name ?? null
      })
      setDirty(false)
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }, [face])
  useEffect(() => { refresh() }, [refresh])

  const open = (name: string): void => {
    const plan = plans?.find((p) => p.name === name)
    if (plan === undefined) return
    setSelected(name)
    setDraft(plan.yaml)
    setDirty(false)
    setNotice(null)
  }

  const save = (): void => {
    if (selected === null) return
    setBusy(true)
    setNotice(null)
    face.savePlan(selected, draft).then(() => {
      setNotice(`已保存「${selected}」并热重载。`)
      setDirty(false)
      refresh(selected)
    }).catch((cause: unknown) => {
      setNotice(`保存失败：${cause instanceof Error ? cause.message : String(cause)}`)
    }).finally(() => {
      setBusy(false)
    })
  }

  const remove = (): void => {
    if (selected === null || !window.confirm(`确定删除方案「${selected}」？该文件不可恢复。`)) return
    setBusy(true)
    setNotice(null)
    face.deletePlan(selected).then(() => {
      setNotice(`已删除「${selected}」并热重载。`)
      refresh()
    }).catch((cause: unknown) => {
      setNotice(`删除失败：${cause instanceof Error ? cause.message : String(cause)}`)
    }).finally(() => {
      setBusy(false)
    })
  }

  const create = (): void => {
    const stem = newName.trim().replace(/\.ya?ml$/i, '').replace(/[^a-zA-Z0-9_-]/g, '')
    if (stem === '') { setNotice('方案名只能包含字母、数字、连字符与下划线。'); return }
    setBusy(true)
    setNotice(null)
    face.savePlan(stem, NEW_PLAN_TEMPLATE.replace('name: new-plan', `name: ${stem}`)).then(() => {
      setNewName('')
      refresh(stem)
    }).catch((cause: unknown) => {
      setNotice(`创建失败：${cause instanceof Error ? cause.message : String(cause)}`)
    }).finally(() => {
      setBusy(false)
    })
  }

  return (
    <div style={card}>
      <div style={head}>
        <h3 style={title}>方案</h3>
        <span style={{ flex: 1 }} />
        <button type="button" style={button} onClick={() => refresh(selected)}>刷新</button>
      </div>
      {error !== null && <p style={errorText}>加载失败：{error}</p>}
      {plans !== null && (
        <div style={row}>
          {plans.map((plan) => (
            <button key={plan.name} type="button" style={tab(selected === plan.name)} onClick={() => open(plan.name)}>
              {plan.name}{plan.active ? ' ●' : ''}
            </button>
          ))}
        </div>
      )}
      {plans !== null && plans.length === 0 && (
        <p style={muted}>还没有方案文件。在下方输入名称新建一个，或手动放置到 ~/.dsh/digital-hands/plans/。</p>
      )}
      {selected !== null && (
        <>
          <p style={hint}>
            编辑 {selected}.yml（● = 本轮已挂载）。保存后自动热重载受管工具；语法错误的方案不会被写入。
          </p>
          <textarea style={textarea} value={draft} spellCheck={false}
            onChange={(e) => { setDraft(e.target.value); setDirty(true) }} />
          <div style={{ ...row, justifyContent: 'flex-end' }}>
            <button type="button" style={button} disabled={busy} onClick={remove}>删除方案</button>
            <button type="button" style={primaryButton} disabled={busy || !dirty} onClick={save}>
              {dirty ? '保存并热重载' : '已保存'}
            </button>
          </div>
        </>
      )}
      <div style={{ ...row, borderTop: '0.5px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-default, #e2e2e2))', paddingTop: 10 }}>
        <input style={{ ...input, width: 220 }} placeholder="新方案名（如 research）" value={newName}
          onChange={(e) => setNewName(e.target.value)} />
        <button type="button" style={button} disabled={busy} onClick={create}>新建方案</button>
      </div>
      {notice !== null && <p style={muted}>{notice}</p>}
    </div>
  )
}

export { apply, inject }
