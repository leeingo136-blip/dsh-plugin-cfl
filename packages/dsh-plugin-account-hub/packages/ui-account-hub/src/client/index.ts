/**
 * The settings account column: one section whose rows are contributed by
 * account plugins through the `account.hub.row` slot. The hub owns the
 * section shell, the account registry read (list + watch), and the row seat;
 * every row's content — status, sign-in affordance, balances — belongs to the
 * account plugin that registered under that id. Harness core hosts no account
 * product, so an empty registry renders the section's empty-state copy.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { AccountHubCardDescriptor, AccountHubType } from '@dsh/api-account-hub'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
// Type-only: pulls in the typert client-side augmentation that adds the
// `accountHub` namespace to ClientRemote. The runtime mount lives in the
// account-hub-mount plugin.
import type {} from '@dsh/api-account-hub/remote'
import { en, zh, type AccountHubKey } from './locales.ts'
import { AccountHubSection, ProviderModelsCard } from './HubSection.tsx'

export { AccountHubSection, ProviderModelsCard }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'settings.accountHub': AccountHubKey }
  interface SlotMap {
    /**
     * One account plugin's row in the settings account column, keyed by the
     * account id from its hub registration. The owner supplies the account
     * identity, its latest published state, and the invoke seam; the content
     * component owns status rendering, sign-in affordances, and any balance
     * or usage detail it wants to show.
     */
    'account.hub.row': { kind: 'keyed'; scope: 'root'; owner: AccountHubRowOwnerProps }
  }
}

/** Owner share of one account row (the section supplies nothing else). */
export interface AccountHubRowOwnerProps {
  /** Stable account id from the plugin's hub registration. */
  accountId: string
  /** Display name from the plugin's hub registration. */
  displayName: string
  /** Latest state the plugin published through the hub watch stream. */
  state: unknown
  /** Forward one plugin-private operation through the hub. */
  invoke: (method: string, args: unknown) => Promise<unknown>
}

/** The registry seam the section reads; closed over the plugin context. */
export interface AccountHubSectionFace {
  t: (key: AccountHubKey) => string
  /** Snapshot of every registered account. */
  list: () => Promise<readonly AccountRow[]>
  /** Subscribe to registry and state changes; returns the disposer. */
  subscribe: (onChange: () => void) => () => void
  /** Forward one plugin-private operation. */
  invoke: (accountId: string, method: string, args: unknown) => Promise<unknown>
  /** Read one account's stored (redacted) parameters from its namespace. */
  readParams: (accountId: string) => Promise<unknown>
  /** Commit edited parameters into one account's settings namespace. */
  commitParams: (accountId: string, ops: SettingsPathOpView[]) => Promise<void>
  /** Register the models-page provider-card entry for one account namespace
   *  (idempotent per namespace; the seat renders nothing unless the account
   *  opted in through `modelsCard`). */
  ensureModelsCard: (settingsNs: string) => void
  /** 官方 DeepSeek 账号桥：账号页用它绘制内置卡片，不经过 accountHub 注册表。 */
  official?: {
    getSnapshot: () => OfficialAccountSnapshot
    subscribe: (onChange: () => void) => () => void
    signIn: () => Promise<void>
    signOut: () => Promise<void>
    cancel: () => Promise<void>
    openAuthorize: () => void
    openConsole: () => void
  }
}

/** One registered account as the section renders it. */
/** 官方余额格式：两位小数、不足一分显示 <¥0.01、负数接近 0 显示 -¥0.01，其余向下截断。 */
function formatBalance(amount: string | number, symbol: '¥' | '$'): string {
  const raw = String(amount).trim()
  if (raw === '' || Number.isNaN(Number(raw))) return `${symbol}0.00`
  const negative = raw.startsWith('-')
  const absText = negative ? raw.slice(1) : raw
  const [integerPart = '0', fractionRaw = ''] = absText.split('.')
  const fraction = (fractionRaw + '00').slice(0, 2)
  const zero = /^0*$/.test(integerPart) && /^0*$/.test(fraction)
  if (zero) return `${symbol}0.00`
  const small = /^0*$/.test(integerPart) && Number(`0.${fractionRaw}`) < 0.01
  if (small) return negative ? `-${symbol}0.01` : `<${symbol}0.01`
  const grouped = Number(integerPart.replace(/^0+(?=\d)/, '') || '0').toLocaleString('en-US')
  return `${negative ? '-' : ''}${symbol}${grouped}.${fraction}`
}

/** DeepSeek 官方账号的只读快照，供内置卡片渲染。 */
export interface OfficialAccountSnapshot {
  signedIn: boolean
  text: string
  level: 'ok' | 'warn' | 'error'
  name: string
  contact: string
  avatarUrl: string
  consoleUrl: string
  /** 正在等待浏览器授权。 */
  signingIn: boolean
  /** 最近一次登录已过期。 */
  expired: boolean
  /** 当前登录尝试的授权地址。 */
  authorizeUrl: string
  rows: Array<{ label: string, value: string }>
}

export interface AccountRow {
  id: string
  displayName: string
  settingsNs: string
  /** Resolved capability family; the section groups rows by it. */
  type?: AccountHubType
  /** Declarative card the hub renders when present. */
  card?: AccountHubCardDescriptor
  /** Whether the hub also serves this account's models-page provider card. */
  modelsCard?: boolean
  state: unknown
}

/** @returns the localized display name for the section nav. */
export function sectionLabel(t: (key: AccountHubKey) => string): string {
  return t('nav')
}

/** Services required by the account column. `remote.accountHub` is mounted
 * by the account-hub-mount plugin, which activates off the bare remote
 * carrier; this plugin's activation parks on the namespace service until the
 * mount lands, so apply() sees it fully populated. */
export const inject = ['slots', 'locale', 'remote', 'remote.accountHub', 'remote.account', 'theme']

/**
 * Register the account column. Both renderers run this: the Desktop shell and
 * the Browser settings panel render the same `settings.section` seat, and the
 * hub's registry read and invoke seam are both served by the host rather than
 * by a surface-specific bridge. @param ctx - client plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('settings.accountHub', { en, zh }), 'accountHub: dictionaries')
  const t = ctx.locale.bind('settings.accountHub')
  // ---- 官方 DeepSeek 账号桥 -------------------------------------------------
  // 注意：这段在插件激活期执行，任何同步异常都会让 @dsh/ui-account-hub 激活失败。
  // 因此整体包在 try/catch 中：官方账号服务缺席时 hub 仍应正常加载。
  let official: AccountHubSectionFace['official']
  try {
    const account = (ctx.remote as unknown as {
      account?: {
        watch(signal: AbortSignal): unknown
        getProfile(meta: unknown): Promise<{ ok: boolean, value?: unknown }>
        getBalance(meta: unknown): Promise<{ ok: boolean, value?: unknown }>
        startSignIn(meta: unknown, origin: string, platform: string): Promise<{ ok: boolean }>
        cancelSignIn(id: string): Promise<{ ok: boolean }>
        signOut(meta: unknown): Promise<{ ok: boolean }>
      }
      $stream?<T>(spec: { name: string, open: (signal: AbortSignal) => unknown, ended: () => Error }): AsyncIterable<{ value: T, accept(): void }>
    }).account
    let activeAttemptId: string | undefined
    let openedAuthorize = ''
    let officialState: OfficialAccountSnapshot = { signedIn: false, text: '未登录', level: 'warn', name: 'DeepSeek 账号', contact: '', avatarUrl: '', consoleUrl: '', signingIn: false, expired: false, authorizeUrl: '', rows: [] }
    const officialListeners = new Set<() => void>()
    const publishOfficial = (patch: Partial<OfficialAccountSnapshot>): void => {
      officialState = { ...officialState, ...patch }
      for (const listener of officialListeners) listener()
    }
    const clientMeta = (): unknown => ({
      version: (globalThis as { DSH_CLIENT_VERSION?: string }).DSH_CLIENT_VERSION ?? '0.2.1-rc.3',
      locale: ctx.locale.getSnapshot().active,
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    })
    const readProfile = async (): Promise<void> => {
      if (account === undefined) return
      try {
        const [profile, balance] = await Promise.all([
          account.getProfile(clientMeta()).catch(() => undefined),
          account.getBalance(clientMeta()).catch(() => undefined),
        ])
        const p = profile?.ok === true && profile.value !== null && typeof profile.value === 'object'
          ? (profile.value as { status?: string, value?: Record<string, unknown> }).value ?? {}
          : {}
        const balanceDetails = balance?.ok === true && balance.value !== null && typeof balance.value === 'object'
          ? balance.value as { status?: string, value?: unknown, bonusWallets?: unknown }
          : undefined
        const name = typeof p['name'] === 'string' ? p['name'] : typeof p['nickname'] === 'string' ? p['nickname'] : 'DeepSeek 账号'
        const contact = typeof p['email'] === 'string' ? p['email'] : typeof p['phone'] === 'string' ? p['phone'] : ''
        const avatarUrl = typeof p['avatarUrl'] === 'string' ? p['avatarUrl'] : ''
        const rows: Array<{ label: string, value: string }> = []
        const wallets = Array.isArray(balanceDetails?.value) ? balanceDetails.value as Array<Record<string, unknown>> : []
        for (const wallet of wallets) {
          const currency = typeof wallet['currency'] === 'string' ? wallet['currency'] : 'CNY'
          const amount = wallet['balance'] ?? wallet['amount']
          if (typeof amount === 'string' || typeof amount === 'number') {
            rows.push({ label: '余额', value: formatBalance(amount, currency === 'CNY' ? '¥' : '$') })
          }
        }
        // 赠金：官方只在有钱包时显示；为 0 的币种不渲染。
        const bonusWallets = Array.isArray(balanceDetails?.bonusWallets)
          ? balanceDetails.bonusWallets as Array<Record<string, unknown>> : []
        for (const wallet of bonusWallets) {
          const currency = typeof wallet['currency'] === 'string' ? wallet['currency'] : 'CNY'
          const amount = wallet['balance'] ?? wallet['amount']
          if ((typeof amount === 'string' || typeof amount === 'number') && Number(amount) > 0) {
            rows.push({ label: '赠金', value: formatBalance(amount, currency === 'CNY' ? '¥' : '$') })
          }
        }
        publishOfficial({ name, contact, avatarUrl, rows, signedIn: true, level: 'ok', text: '已登录' })
      } catch { /* 资料读取失败不影响卡片 */ }
    }
    if (account !== undefined) {
      ctx.effect(() => {
        const controller = new AbortController()
        try {
          const remote = ctx.remote as unknown as {
            $stream<T>(spec: { name: string, open: (signal: AbortSignal) => unknown, ended: () => Error }): AsyncIterable<{ value: T, accept(): void }>
          }
          const stream = remote.$stream<{ status?: string }>({
            name: 'account',
            open: signal => account.watch(signal),
            ended: () => new Error('account stream ended'),
          })
          void (async () => {
            try {
              for await (const frame of stream) {
                const view = frame.value as {
                  status?: string
                  attempt?: { id?: string, phase?: string, authorizeUrl?: string }
                  links?: { usageUrl?: unknown }
                }
                const signedIn = view.status === 'credential-stored'
                const phase = view.attempt?.phase ?? ''
                if (typeof view.attempt?.id === 'string') activeAttemptId = view.attempt.id
                if (typeof view.attempt?.authorizeUrl === 'string' && view.attempt.authorizeUrl !== '' && view.attempt.authorizeUrl !== officialState.authorizeUrl) {
                  publishOfficial({ authorizeUrl: view.attempt.authorizeUrl })
                }
                // 等待浏览器授权时自动打开一次授权页；被拦截时用户仍可点按钮。
                if (phase === 'waiting-browser' && typeof view.attempt?.authorizeUrl === 'string'
                  && view.attempt.authorizeUrl !== '' && view.attempt.authorizeUrl !== openedAuthorize) {
                  openedAuthorize = view.attempt.authorizeUrl
                  try { globalThis.open(view.attempt.authorizeUrl, '_blank', 'noopener,noreferrer') } catch { /* 浏览器拦截时保留按钮 */ }
                }
                const rawConsole = view.links?.usageUrl
                if (typeof rawConsole === 'string' && rawConsole !== '') {
                  try { publishOfficial({ consoleUrl: new URL(rawConsole, globalThis.location.origin).href }) } catch { /* 忽略非法 URL */ }
                }
                if (signedIn) {
                  publishOfficial({ signedIn: true, signingIn: false, expired: false, authorizeUrl: '', level: 'ok', text: '已登录' })
                } else if (['initializing', 'waiting-browser', 'exchanging', 'committing'].includes(phase)) {
                  publishOfficial({ signedIn: false, signingIn: true, expired: false, level: 'warn', text: '已发起登录，请完成浏览器授权……' })
                } else if (phase === 'expired') {
                  publishOfficial({ signedIn: false, signingIn: false, expired: true, authorizeUrl: '', level: 'error', text: '登录已过期。', name: 'DeepSeek 账号', contact: '', avatarUrl: '', rows: [] })
                } else {
                  publishOfficial({ signedIn: false, signingIn: false, expired: false, level: 'warn', text: '未登录', name: 'DeepSeek 账号', contact: '', avatarUrl: '', rows: [] })
                }
                frame.accept()
                if (signedIn) void readProfile()
              }
            } catch { /* 官方账号流不��用时保持未登录态 */ }
          })()
        } catch (error) {
          console.warn('[account-hub] official account stream unavailable', error)
        }
        return () => { controller.abort() }
      }, 'accountHub: official account stream')
    }
    official = account === undefined ? undefined : {
      getSnapshot: () => ({ ...officialState, rows: [...officialState.rows] }),
      subscribe: (onChange: () => void) => { officialListeners.add(onChange); return () => { officialListeners.delete(onChange) } },
      signIn: async () => {
        const transport = (globalThis as { __DSH_TRANSPORT__?: { streamBaseUrl?: string } }).__DSH_TRANSPORT__
        const origin = transport?.streamBaseUrl !== undefined ? new URL(transport.streamBaseUrl).origin : globalThis.location.origin
        const result = await account.startSignIn(clientMeta(), origin, 'desktop')
        if (result.ok !== true) throw new Error('官方账号登录启动失败')
      },
      openConsole: () => {
        const url = officialState.consoleUrl !== '' ? officialState.consoleUrl : 'https://platform.deepseek.com'
        globalThis.open(url, '_blank', 'noopener,noreferrer')
      },
      signOut: async () => {
        const result = await account.signOut(clientMeta())
        if (result.ok !== true) throw new Error('官方账号退出失败')
      },
      openAuthorize: () => {
        if (officialState.authorizeUrl === '') return
        globalThis.open(officialState.authorizeUrl, '_blank', 'noopener,noreferrer')
      },
      cancel: async () => {
        if (activeAttemptId === undefined) return
        await account.cancelSignIn(activeAttemptId)
      },
    }
  } catch (error) {
    console.warn('[account-hub] official account bridge unavailable', error)
  }
  const face: AccountHubSectionFace = {
    official,
    t,
    list: async () => {
      const result = await ctx.remote.accountHub.list()
      if (!result.ok) throw new Error(result.error.message)
      // The view already carries each account's latest published state — the
      // card's status line, signed-in flag, and identity/balance facts.
      return result.value.map(view => ({ ...view, state: view.state as unknown }))
    },
    subscribe: (onChange) => {
      const stream = ctx.remote.$stream<{ id: string; state?: unknown }>({
        name: 'accountHub', open: signal => ctx.remote.accountHub.watch(signal),
        ended: () => new Error('account hub stream ended'),
      })
      void (async () => {
        for await (const frame of stream) {
          frame.accept()
          onChange()
        }
      })()
      return () => { void stream.dispose() }
    },
    invoke: async (accountId, method, args) => {
      const result = await ctx.remote.accountHub.invoke(accountId, method, args as JsonValue)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    readParams: async (accountId) => {
      const result = await ctx.remote.accountHub.readParams(accountId)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    commitParams: async (accountId, ops) => {
      const result = await ctx.remote.accountHub.commitParams(accountId, ops)
      if (!result.ok) throw new Error(result.error.message)
    },
    ensureModelsCard: (settingsNs) => {
      if (modelCardEntries.has(settingsNs)) return
      const dispose = ctx.slots.register({
        name: 'settings.models.provider-card',
        key: settingsNs,
        locale: 'settings.accountHub',
        inject: () => ({ face }),
      }, ProviderModelsCard)
      modelCardEntries.set(settingsNs, dispose)
    },
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'account', order: -10, label: () => t('nav'),
    locale: 'settings.accountHub',
    children: { 'account.hub.row': { kind: 'keyed', scope: 'root' } },
    inject: () => ({ face }),
  }, AccountHubSection))
  // The models page's `settings.models.provider-card` seat: one keyed entry
  // per opted-in account namespace (`ensureModelsCard`, called by the section
  // as accounts come and go). Accounts whose models page belongs to another
  // editor never opt in, so their rows stay exactly as they were.
  const modelCardEntries = new Map<string, () => void>()
  ctx.effect(() => () => {
    for (const dispose of modelCardEntries.values()) dispose()
  }, 'accountHub: models-card entries')
}
