/**
 * External DeepSeek account plugin (local-development form).
 *
 * One plugin owns the whole brand surface the harness core no longer ships:
 * platform OAuth sign-in with PKCE, the account token credential, the
 * `deepseek-account` inference provider, and the dsh-account-hub registration
 * whose declarative card renders sign-in/out and model scanning in the
 * settings account column. No browser code ships here; the hub draws the card
 * from the descriptor below and every interactive gesture travels `invoke`.
 */
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { arch, platform, release } from 'node:os'
import { promises as streamPromises } from 'node:stream'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-authorization'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@dsh/api-account-hub'
import { ACCOUNT_HUB_CHANGED } from '@dsh/api-account-hub'
import type { AccountHubCardDescriptor, AccountHubSelectOption } from '@dsh/api-account-hub'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import {
  catalogModelInfo, Config, DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS, plainOptions,
  PUBLIC_BASE_URL, registerDeepSeekProvider, resolveAdapterOptions,
} from '@deepseek-ai/dsh-llm-deepseek'
import type { DeepSeekCatalogModel, DeepSeekRequestAuth, ResolvedDeepSeekOptions } from '@deepseek-ai/dsh-llm-deepseek'
import { openNativePath } from '@deepseek-ai/dsh-native-command'
import { z } from 'zod'
import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization'
import { profile, readBalance, readProfile, type AccountProfile, type AccountWallets } from './details.ts'
import { revokeAccount } from './logout.ts'
import {
  AccountUnauthorizedError, browserUrl, clientHeaders, exchange, initialization,
  PlatformAuthError, requestPlatform, setClientPlatform,
} from './protocol.ts'

export { Config } from '@deepseek-ai/dsh-llm-deepseek'

/** Stable identity: hub account id, provider route, and entry id fallback. */
export const name = 'deepseek-account-external'
console.log('[deepseek-account-external] module loaded from', import.meta.url)
const ID = name
const PROVIDER = 'deepseek-account'

// Client identity headers must name the hosting platform the way the official
// composition does: the desktop shell (Electron host) declares desktop-mac /
// desktop-win, every other runtime keeps the web identity.
setClientPlatform(process.versions.electron !== undefined
  ? platform() === 'win32' ? 'win32' : 'darwin'
  : null)

/** Deployment origins; local-development constants (the dedicated repository
 *  form can surface them as plugin config). */
const PLATFORM_ORIGIN = 'https://platform.deepseek.com'
const INFERENCE_ORIGIN = 'https://api.deepseek.com'

/** Minimum spacing between on-view balance reads. The official mechanism has
 *  no timer — it reads when a viewer looks — so this only keeps the
 *  publish → re-pull → getState cycle from re-triggering the read. */
const VIEW_REFRESH_THROTTLE_MS = 30_000

const KEY = credentialKey(ID, 'default')
const DEVICE = credentialKey(ID, 'device')

const grant = z.object({ version: z.literal(1), token: z.string().min(1), issuer: z.url() })
// `user` carries the Platform profile captured at the last successful login:
// the profile endpoint sits behind a browser challenge the Host cannot
// answer, so the exchange response is the one reliable profile source.
const device = z.object({ id: z.uuid(), user: z.unknown().optional() })

/** The web-server face this plugin needs at runtime (duck-typed). */
interface WebServerFace {
  register(route: { kind: 'exact'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }): () => void
  readonly port: number
  readonly host: string
}

/** The settings face used to persist scanned models (duck-typed). */
interface SettingsFace {
  mutate(ns: string, ops: unknown[]): Promise<unknown>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: WebServerFace
    settings: SettingsFace
  }
}

/** One browser sign-in attempt's observable phase. */
type Phase = 'initializing' | 'waiting-browser' | 'exchanging' | 'committing' | 'succeeded' | 'cancelled' | 'failed' | 'expired'

interface Attempt {
  phase: Phase
  errorCode?: string
  controller: AbortController
  done: Promise<void>
  running: Promise<void>
  callback?: ServerResponse
  completionUrl?: string
}

interface AttemptView {
  text: string
  level: 'warn' | 'error'
}

/** The published account-card state: a one-line status the hub renders, plus
  * the signed-in identity and balance facts the hub's official-layout card
  * draws (see AccountHubCardState in the account-hub contract). */
export interface AccountStateView {
  text: string
  level: 'ok' | 'warn' | 'error'
  signedIn?: boolean
  /** True while a browser sign-in attempt is in flight: the hub hides the
    * sign-in affordance and shows the progress copy instead. */
  signingIn?: boolean | undefined
  /** Brand facts the hub draws as the card's fixed identity: the bundled
    * whale logo and the brand label — shown signed-out and signed-in alike. */
  brand?: { logoUrl?: string | undefined; name: string } | undefined
  identity?: {
    name?: string | undefined
    contact?: string | undefined
    avatarUrl?: string | undefined
    infoLabel?: string | undefined
    infoUrl?: string | undefined
  }
  balance?: {
    rows?: {
      label: string
      value?: string
      loading?: boolean
      unavailable?: { label: string; href: string }
    }[] | undefined
    more?: { label: string; links: { label: string; href: string; primary?: boolean }[] }[] | undefined
  } | undefined
}

/** The brand whale logo, bundled with the plugin and inlined as a data URI
  * so the hub card can draw it without any plugin-served route. */
const LOGO_DATA_URI: string | undefined = (() => {
  try {
    const svg = readFileSync(new URL('../assets/deepseek-logo.svg', import.meta.url), 'utf8')
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
  } catch { return undefined }
})()

const SIGN_IN_PHASE_TEXT: { [P in Exclude<Phase, 'succeeded' | 'cancelled' | 'failed' | 'expired'>]: string } = {
  initializing: '登录中：初始化…',
  'waiting-browser': '登录中：等待浏览器授权…',
  exchanging: '登录中：交换凭据…',
  committing: '登录中：写入凭据…',
}

/** Format one wallet amount the way the built-in account column does:
  * symbol plus two fixed fraction digits with thousands separators. */
function formatAmount(amount: string, currency: 'CNY' | 'USD'): string {
  const symbol = currency === 'CNY' ? '¥' : '$'
  const value = Number(amount)
  if (!Number.isFinite(value)) return `${symbol}${amount}`
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** The declarative account card the hub renders for this plugin. Fields are
  * split by surface: the account column shows the sign-in actions (its
  * signed-in layout comes from the state's identity/balance facts); the
  * models-page provider card — the 'edit' area under the DeepSeek account row
  * — shows the API parameters (base URL, reasoning effort). */
const CARD: AccountHubCardDescriptor = {
  fields: [
    {
      key: 'baseURL', kind: 'text', surface: 'models', label: 'API Base URL',
      placeholder: PUBLIC_BASE_URL,
      description: '留空使用官方默认地址；账号令牌只发往该地址的站点。',
    },
    {
      key: 'reasoningEffort', kind: 'select', surface: 'models', label: '默认推理强度',
      options: [
        { value: 'low', label: '低（low）' },
        { value: 'high', label: '高（high，默认）' },
        { value: 'max', label: '最高（max）' },
        { value: 'off', label: '关闭（off）' },
      ] satisfies AccountHubSelectOption[],
      description: '写入后立即生效，模型页该账号分组按此设置请求。',
    },
    { key: 'signIn', kind: 'button', surface: 'account', when: 'signed-out', action: 'sign-in', label: '登录', tone: 'primary', busyLabel: '等待浏览器授权…' },
    { key: 'signOut', kind: 'button', surface: 'account', when: 'signed-in', action: 'sign-out', label: '退出登录', busyLabel: '退出中…' },
  ],
}

/**
 * The account service. Hosting services (credentials, authorization, web
 * server, llm, accountHub) arrive through injection; the plugin registers its
 * browser flow, inference provider, and hub card in its constructor and
 * cleans up with its fiber.
 */
export default class DeepSeekAccountExternal extends Service {
  static inject = ['llm', 'credentials', 'authorization', 'accountHub']
  static Config = Config

  private readonly origin = PLATFORM_ORIGIN
  private readonly inferenceOrigin = INFERENCE_ORIGIN
  private readonly settingsNs: string
  private readonly requestTimeoutMs = 30_000
  private readonly attemptTimeoutMs = 600_000
  private readonly logoutPolicy = { maxRetries: 5, delayMs: 1_000, requestTimeoutMs: 30_000 }
  private readonly logoutLifetime = new AbortController()

  private signedIn = false
  private profileCache: AccountProfile | null = null
  /** undefined = load in flight, null = failed, value = the wallet lists. */
  private balanceCache: AccountWallets | null | undefined = undefined
  /** On-view refresh throttle and in-flight guard (see refreshBalanceOnView). */
  private lastBalanceRequest = 0
  private balanceRead: Promise<void> | undefined
  private attempt: Attempt | undefined
  private attemptView: AttemptView | undefined
  private view: AccountStateView = { text: '未登录', level: 'warn' }
  private closed = false
  private removing: Promise<void> | undefined

  /** @param ctx - host context. @param config - protocol configuration. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'deepseekAccount')
    console.log('[deepseek-account-external] service constructing; ctx.fiber=', ctx.fiber?.entry?.options.id)
    this.settingsNs = ctx.fiber?.entry?.options.id ?? ID

    ctx.authorization.registerFlow({
      key: KEY, label: 'DeepSeek', methods: [{ id: 'browser', label: 'DeepSeek' }],
      run: (session) => {
        const attempt = this.attempt
        if (attempt === undefined) return Promise.reject(new PlatformAuthError('protocol'))
        attempt.running = this.run(session, attempt)
        return attempt.running
      },
    })

    ctx.on('credentials/record-updated', (key: string) => {
      if (key !== KEY) return
      this.profileCache = null
      this.balanceCache = undefined
      void this.ingestStoredState()
    })

    ctx.effect(() => async () => {
      this.closed = true
      this.logoutLifetime.abort()
      const active = this.attempt
      if (active !== undefined) {
        if (active.phase !== 'committing') active.controller.abort()
        await active.done
      }
      await this.removing
    }, 'deepseek-account-external: attempt lifetime')

    this.registerProvider(ctx, config)
    this.registerHub(ctx)
    this.publish()
  }

  async [Service.init](): Promise<void> {
    await this.ingestStoredState()
  }

  // ---- provider registration -------------------------------------------------

  private registerProvider(ctx: Context, config: Config): void {
    const options = () => resolveAdapterOptions(plainOptions(config), launchEnvironmentOf(ctx))
    options()
    const resolveAuth = async (connection: ResolvedDeepSeekOptions): Promise<DeepSeekRequestAuth> => {
      const token = await this.resolveToken(connection.baseURL)
      if (token === undefined) {
        throw new LlmError('Sign in to DeepSeek to use the account provider. The request destination must allow account authentication.', 'ACCOUNT_SIGN_IN_REQUIRED')
      }
      return {
        headers: { 'x-dsh-auth-token': token },
        onRequestError: async (error: unknown) => {
          if (!(error instanceof LlmError)) return error
          if (error.failure.status !== 401) return error
          const rejected = new LlmError(error.message, 'ACCOUNT_TOKEN_INVALID', { ...error.failure, cause: error })
          try { await this.rejectToken(token) }
          catch (_credentialRemovalFailed) { /* Storage failure cannot replace the inference failure. */ }
          return rejected
        },
      }
    }
    ctx.llm.registerConfigurableProviders([
      {
        provider: PROVIDER,
        displayName: 'DeepSeek 账号',
        settingsNs: this.settingsNs,
        settingsPath: [],
        // This route's availability rides the account sign-in, not a stored
        // key: configuration surfaces must read its visibility from the live
        // model catalog (discoverModels yields none while signed out) instead
        // of the presence of this settings section.
        accountProvider: true,
      },
    ])
    registerDeepSeekProvider(ctx, PROVIDER, {
      options, resolveAuth, providerName: 'DeepSeek 账号',
      discoverModels: async (provider: string) => {
        const connection = options()
        try { await resolveAuth(connection) }
        catch (error) {
          if (error instanceof LlmError && error.code === 'ACCOUNT_SIGN_IN_REQUIRED') return []
          throw error
        }
        return connection.models.map(model => catalogModelInfo(provider, model))
      },
    })
  }

  // ---- hub registration ------------------------------------------------------

  private registerHub(ctx: Context): void {
    const dispose = ctx.accountHub.register({
      id: ID,
      displayName: 'DeepSeek 账号',
      settingsNs: this.settingsNs,
      provider: PROVIDER,
      // Credentials only: the adapter rides the official harness DeepSeek
      // inference path; this plugin supplies the account token and endpoint
      // facts, harness keeps connecting, streaming, and metering.
      workMode: 'credential-inject',
      card: CARD,
      invoke: (method: string, args: JsonValue) => this.invoke(method, args),
      getState: () => {
        this.refreshBalanceOnView()
        return this.view as unknown as JsonValue
      },
    })
    ctx.effect(() => dispose, 'deepseek-account-external: hub registration')
  }

  /** Forward one hub-card operation to its implementation. */
  private async invoke(method: string, _args: JsonValue): Promise<JsonValue> {
    switch (method) {
      case 'sign-in': {
        await this.startSignIn()
        return { message: this.view.text }
      }
      case 'sign-out': {
        await this.signOut()
        return { message: '已退出登录。' }
      }
      case 'scan-models': return this.scanModels()
      default: throw new Error(`未知账号操作 "${method}"`)
    }
  }

  // ---- published state -------------------------------------------------------

  /** Recompute and publish the account-card state: the status line, and once
    * signed in, the identity and balance facts for the official layout. */
  private publish(): void {
    const attempt = this.attemptView
    if (attempt !== undefined) {
      this.view = {
        ...attempt,
        signedIn: false,
        // The warn phases are the in-flight ones; failed/expired carry
        // 'error' and hand the card back its sign-in affordance.
        signingIn: attempt.level === 'warn',
        brand: { logoUrl: LOGO_DATA_URI, name: 'DeepSeek账号' },
      }
    } else if (this.signedIn) {
      const who = this.profileCache?.name || this.profileCache?.contact || null
      this.view = {
        text: who === null ? '已登录' : `已登录 · ${who}`,
        level: 'ok',
        signedIn: true,
        brand: { logoUrl: LOGO_DATA_URI, name: 'DeepSeek账号' },
        identity: {
          name: this.profileCache?.name ?? undefined,
          contact: this.profileCache?.contact ?? undefined,
          avatarUrl: this.profileCache?.avatarUrl ?? undefined,
          infoLabel: '账号信息',
          infoUrl: new URL('/', this.origin).href,
        },
        balance: this.balanceView(),
      }
    } else this.view = {
      text: '未登录', level: 'warn', signedIn: false,
      brand: { logoUrl: LOGO_DATA_URI, name: 'DeepSeek账号' },
    }
    this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
  }

  /** The balance-card rows: wallets while loaded, loading/failed fallbacks otherwise. */
  private balanceView(): AccountStateView['balance'] {
    const usageUrl = new URL('/usage', this.origin).href
    const topUpUrl = new URL('/top_up', this.origin).href
    const balanceOf = (wallets: AccountWallets['normal']): string | undefined => {
      if (wallets.length === 0) return undefined
      return wallets.map(wallet => formatAmount(wallet.balance, wallet.currency)).join(' + ')
    }
    const rowOf = (label: string, wallets: AccountWallets['normal'] | undefined): {
      label: string; value?: string; loading?: boolean; unavailable?: { label: string; href: string }
    } => {
      if (this.balanceCache === undefined) return { label, loading: true }
      if (this.balanceCache === null || wallets === undefined) {
        return { label, unavailable: { label: '余额不可用', href: usageUrl } }
      }
      const value = balanceOf(wallets)
      return value === undefined ? { label, value: formatAmount('0', 'CNY') } : { label, value }
    }
    const rows = [rowOf('余额', this.balanceCache?.normal)]
    // The bonus row shows only while loading/failed or when some bonus is positive,
    // mirroring the built-in account column.
    if (this.balanceCache === undefined || this.balanceCache === null
      || this.balanceCache.bonus.some(wallet => Number(wallet.balance) > 0)) {
      rows.push(rowOf('赠款余额', this.balanceCache?.bonus))
    }
    return {
      rows,
      more: [{
        label: '更多',
        links: [
          { label: '用量', href: usageUrl },
          { label: '充值', href: topUpUrl, primary: true },
        ],
      }],
    }
  }

  /** Read the stored grant, refresh the profile and wallets, and republish. */
  private async ingestStoredState(): Promise<void> {
    const record = await this.ctx.credentials.readRecord(KEY)
    if (record === undefined) {
      this.signedIn = false
      this.profileCache = null
      this.balanceCache = undefined
      this.publish()
      return
    }
    const parsed = grant.safeParse(record.kind === 'grant' ? record.payload : undefined)
    if (!parsed.success) {
      this.signedIn = false
      this.profileCache = null
      this.balanceCache = undefined
      this.publish()
      return
    }
    this.signedIn = true
    await this.seedProfileFromDevice()
    this.publish()
    await this.refreshDetails(parsed.data.token)
  }

  /** Seed the identity cache from the profile captured at the last login, so
    * the signed-in card renders even while the profile endpoint stays behind
    * its browser challenge. */
  private async seedProfileFromDevice(): Promise<void> {
    if (this.profileCache !== null) return
    const record = await this.ctx.credentials.readRecord(DEVICE)
    if (record?.kind !== 'grant') return
    const parsedDevice = device.safeParse(record.payload)
    if (!parsedDevice.success || parsedDevice.data.user == null) return
    try { this.profileCache = profile(parsedDevice.data.user) } catch { /* stale profile data is discarded */ }
  }

  /** Persist the raw profile the exchange response carried alongside the device id. */
  private async storeDeviceUser(user: unknown): Promise<void> {
    await this.ctx.credentials.modifyRecord(DEVICE, async (current) => {
      if (current?.kind !== 'grant') return undefined
      return { kind: 'grant', payload: { ...(current.payload as Record<string, unknown>), user } }
    })
  }

  /** On-view balance refresh, mirroring the official account mechanism: the
    * official client re-reads profile and balance whenever a viewer opens the
    * account surface and on every watch frame, with no background timer. The
    * hub equivalent of "a viewer is looking" is `getState()` — the browser
    * pulls it on mount and after each pushed change — so the read starts
    * there, throttled so a publish → re-pull → getState cycle cannot re-arm
    * itself into a fetch loop. */
  private refreshBalanceOnView(): void {
    if (!this.signedIn) return
    const now = Date.now()
    if (this.balanceRead !== undefined || now - this.lastBalanceRequest < VIEW_REFRESH_THROTTLE_MS) return
    this.lastBalanceRequest = now
    this.balanceRead = (async () => {
      const grant = await this.readCurrentGrant()
      if (grant !== null) await this.refreshDetails(grant.token)
    })().finally(() => { this.balanceRead = undefined })
  }

  /** Fetch the Platform profile and wallets for one token and republish; a
    * rejected token expires the grant, a failed read degrades its card row. */
  private async refreshDetails(token: string): Promise<void> {
    const signal = AbortSignal.any([this.logoutLifetime.signal, AbortSignal.timeout(this.requestTimeoutMs)])
    const [profileOutcome, balanceOutcome] = await Promise.allSettled([
      readProfile(this.origin, token, signal),
      readBalance(this.origin, token, signal),
    ])
    if (profileOutcome.status === 'rejected' && profileOutcome.reason instanceof AccountUnauthorizedError) {
      await this.expireCredential(token)
      return
    }
    if (profileOutcome.status === 'fulfilled') this.profileCache = profileOutcome.value
    this.balanceCache = balanceOutcome.status === 'fulfilled' ? balanceOutcome.value : null
    this.publish()
  }

  // ---- credential plumbing ---------------------------------------------------

  private async readCurrentGrant(): Promise<z.infer<typeof grant> | null> {
    if (this.closed) return null
    const record = await this.ctx.credentials.readRecord(KEY)
    if (record === undefined) return null
    if (record.kind !== 'grant') throw new PlatformAuthError('storage')
    const parsed = grant.safeParse(record.payload)
    if (!parsed.success) throw new PlatformAuthError('storage')
    if (parsed.data.issuer !== this.origin) throw new PlatformAuthError('protocol')
    return parsed.data
  }

  /** Resolve a credential only for the configured inference origin. */
  async resolveToken(url: string): Promise<string | undefined> {
    if (this.closed || this.removing !== undefined) return undefined
    const destination = new URL(url)
    if (destination.origin !== this.inferenceOrigin || destination.username || destination.password) return undefined
    const record = await this.ctx.credentials.readRecord(KEY)
    if (record === undefined) return undefined
    if (record.kind !== 'grant') throw new PlatformAuthError('storage')
    const result = grant.safeParse(record.payload)
    if (!result.success) throw new PlatformAuthError('storage')
    const issuer = new URL(result.data.issuer)
    if (result.data.token.startsWith('dsh_mock_')) return undefined
    if (this.inferenceOrigin === 'https://api.deepseek.com') {
      if (['localhost', '127.0.0.1', '[::1]'].includes(issuer.hostname)) return undefined
    } else if (issuer.origin !== this.origin) return undefined
    return result.data.token
  }

  /** Remove an inference-rejected token while it still matches the stored login. */
  async rejectToken(token: string): Promise<void> {
    const stored = await this.readCurrentGrant()
    if (stored?.token !== token) return
    await this.expireCredential(token)
  }

  private async expireCredential(token: string): Promise<void> {
    this.removing ??= (async () => {
      if (this.attempt !== undefined) await this.cancelSignIn()
      const record = await this.ctx.credentials.readRecord(KEY)
      if (this.closed || record?.kind !== 'grant') { this.signedIn = false; this.publish(); return }
      const current = grant.parse(record.payload)
      if (current.token !== token || current.issuer !== this.origin) return
      await this.ctx.credentials.deleteRecord(KEY)
      this.signedIn = false
      this.profileCache = null
      this.publish()
    })().finally(() => { this.removing = undefined })
    await this.removing
  }

  // ---- browser sign-in -------------------------------------------------------

  /** Start (or join) one browser authorization attempt. */
  private async startSignIn(): Promise<void> {
    if (this.removing !== undefined) await this.removing
    if (this.closed) throw new PlatformAuthError('protocol')
    if (this.attempt !== undefined && ['initializing', 'waiting-browser', 'exchanging', 'committing'].includes(this.attempt.phase)) return
    const previous = this.attempt
    if (previous !== undefined) await previous.done
    const webServer = this.ctx.get('webServer')
    if (webServer === undefined) throw new PlatformAuthError('protocol')

    const attempt: Attempt = {
      phase: 'initializing',
      controller: new AbortController(), done: Promise.resolve(), running: Promise.resolve(),
    }
    this.attempt = attempt
    this.attemptView = { text: SIGN_IN_PHASE_TEXT.initializing, level: 'warn' }
    this.publish()
    attempt.done = this.ctx.authorization.begin({
      key: KEY, signal: attempt.controller.signal,
      interaction: { notify: () => undefined, prompt: () => Promise.reject(new PlatformAuthError('protocol')) },
    }).then((outcome) => {
      this.setPhase(attempt, outcome.status === 'authorized' ? 'succeeded' : 'cancelled')
      // The browser is parked on the redirect URL; answer it or the tab hangs forever.
      if (outcome.status === 'authorized' && attempt.completionUrl !== undefined) {
        attempt.callback?.writeHead(302, { location: attempt.completionUrl, 'cache-control': 'no-store' }).end()
      } else attempt.callback?.writeHead(204, { 'cache-control': 'no-store' }).end()
    }).catch((error: unknown) => {
      const code = error instanceof PlatformAuthError ? error.code : 'protocol'
      console.info('[deepseek-account] sign-in failed', { errorCode: code })
      this.setPhase(attempt, code === 'expired' ? 'expired' : 'failed', code)
      // Mirror the platform account's web failure page: close the parked tab.
      const nonce = randomBytes(16).toString('base64url')
      const message = '登录失败，请关闭此标签页并在原页面重试。'
      attempt.callback?.writeHead(200, {
        'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
        'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'`,
        'referrer-policy': 'no-referrer',
      }).end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${message}</title>`
        + `<body><p>${message}</p><script nonce="${nonce}">window.close()</script></body></html>`)
    }).then(async () => {
      await attempt.running.catch(() => undefined)
      if (attempt.callback !== undefined) {
        await streamPromises.finished(attempt.callback, { cleanup: true }).catch(() => undefined)
      }
    })
  }

  private setPhase(attempt: Attempt, phase: Phase, errorCode?: string): void {
    if (this.attempt !== attempt) return
    attempt.phase = phase
    if (errorCode !== undefined) attempt.errorCode = errorCode
    if (phase === 'succeeded' || phase === 'cancelled') {
      this.attemptView = undefined
    } else if (phase === 'failed' || phase === 'expired') {
      this.attemptView = { text: phase === 'expired' ? '登录超时，请重试。' : `登录失败（${errorCode ?? 'protocol'}）`, level: 'error' }
    } else {
      this.attemptView = { text: SIGN_IN_PHASE_TEXT[phase], level: 'warn' }
    }
    this.publish()
  }

  /** Cancel the active attempt; committing attempts settle before returning. */
  private async cancelSignIn(): Promise<void> {
    const attempt = this.attempt
    if (attempt === undefined) return
    if (attempt.phase !== 'committing') {
      attempt.controller.abort()
      this.ctx.authorization.cancel(KEY)
    }
    await attempt.done
  }

  /** The PKCE browser flow: init, open the browser, receive the code, exchange, commit. */
  private async run(session: AuthorizationSession, attempt: Attempt): Promise<void> {
    const webServer = this.ctx.get('webServer')
    if (webServer === undefined) throw new PlatformAuthError('protocol')
    const verifier = randomBytes(32).toString('base64url')
    const state = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    let authorizeId: string | undefined
    let disposeRoute: (() => void) | undefined
    const code = Promise.withResolvers<string>()
    void code.promise.catch(() => undefined)
    const deadline = new AbortController()
    let expiresAt = Date.now() + this.attemptTimeoutMs
    const signal = AbortSignal.any([session.signal, deadline.signal])
    let timer = setTimeout(() => { deadline.abort() }, this.attemptTimeoutMs)
    const abort = (): void => { code.reject(new PlatformAuthError('expired')) }
    signal.addEventListener('abort', abort, { once: true })
    try {
      disposeRoute = webServer.register({
        kind: 'exact', path: '/oauth/callback', handler: (req: IncomingMessage, res: ServerResponse) => {
          let url: URL
          try { url = new URL(req.url ?? '/', 'http://127.0.0.1') }
          catch { res.writeHead(400, { 'cache-control': 'no-store' }).end(); return }
          const receivedCode = url.searchParams.get('code')
          const receivedState = url.searchParams.get('state') ?? ''
          const validState = Buffer.byteLength(receivedState) === Buffer.byteLength(state)
            && timingSafeEqual(Buffer.from(receivedState), Buffer.from(state))
          if (req.method !== 'GET' || url.pathname !== '/oauth/callback' || !validState || !receivedCode
            || url.searchParams.getAll('state').length !== 1 || url.searchParams.getAll('code').length !== 1) {
            res.writeHead(400, { 'cache-control': 'no-store' }).end(); return
          }
          if (signal.aborted || attempt.callback !== undefined || attempt.phase !== 'waiting-browser') {
            res.writeHead(410, { 'cache-control': 'no-store' }).end(); return
          }
          attempt.callback = res
          code.resolve(receivedCode)
        },
      })
      signal.throwIfAborted()
      const callbackOrigin = `http://127.0.0.1:${webServer.port}`
      const redirectUri = `${callbackOrigin}/oauth/callback`
      const init = initialization.safeParse(await requestPlatform(this.origin, 'auth_init', {
        code_challenge: challenge, code_challenge_method: 'S256', state, redirect_uri: redirectUri,
        locale: 'zh_CN', login_source: 'web',
      }, signal), { reportInput: true })
      if (!init.success) this.rejectPayload('auth_init', init.error)
      const authorizeUrl = browserUrl(init.data.authorize_url, this.origin, '/dsh/authorize')
      authorizeId = init.data.authorize_id
      signal.throwIfAborted()
      const now = Date.now()
      expiresAt = Math.min(expiresAt, now + init.data.expires_in * 1000)
      if (expiresAt - now <= 0) { deadline.abort(); signal.throwIfAborted() }
      clearTimeout(timer)
      timer = setTimeout(() => { deadline.abort() }, expiresAt - now)
      this.setPhase(attempt, 'waiting-browser')
      // The gesture fails soft: an absent or refused browser keeps the attempt
      // cancellable, and the authorize URL stays in the host log for manual use.
      void openNativePath(authorizeUrl, signal).catch((error: unknown) => {
        console.info('[deepseek-account] browser open failed', { error: error instanceof Error ? error.message : String(error), authorizeUrl })
      })
      const receivedCode = await code.promise
      signal.throwIfAborted()
      this.setPhase(attempt, 'exchanging')
      const deviceRecord = await this.ctx.credentials.modifyRecord(DEVICE, current => Promise.resolve(current === undefined
        ? { kind: 'grant', payload: { id: randomUUID() } } : undefined))
      if (deviceRecord?.kind !== 'grant') throw new PlatformAuthError('storage')
      const identity = device.parse(deviceRecord.payload)
      const result = exchange.safeParse(await requestPlatform(this.origin, 'auth_exchange', {
        code: receivedCode, code_verifier: verifier, redirect_uri: redirectUri,
        device_id: identity.id, device_model: `${platform()}-${arch()}`, os_version: `${platform()} ${release()}`,
      }, signal), { reportInput: true })
      if (!result.success) this.rejectPayload('auth_exchange', result.error)
      // The exchange response carries the signed-in user: project it into the
      // card state and persist it, so the identity survives restarts (the
      // dedicated profile endpoint sits behind a browser challenge).
      if (result.data.user != null) {
        await this.storeDeviceUser(result.data.user).catch(() => undefined)
        try {
          this.profileCache = profile(result.data.user)
          this.publish()
        } catch { /* invalid optional user data keeps the previous profile */ }
      }
      const completionUrl = new URL(browserUrl(result.data.authorized_url, this.origin, '/dsh/authorized'))
      completionUrl.searchParams.set('login_source', 'web')
      attempt.completionUrl = completionUrl.href
      if (Date.now() >= expiresAt) deadline.abort()
      signal.throwIfAborted()
      this.setPhase(attempt, 'committing')
      clearTimeout(timer)
      try { await session.commit({ kind: 'grant', payload: { version: 1, token: result.data.token, issuer: this.origin } }) }
      catch { throw new PlatformAuthError('storage') }
    } catch (error) {
      if (deadline.signal.aborted) throw new PlatformAuthError('expired')
      throw error
    } finally {
      disposeRoute?.()
      if (signal.aborted && authorizeId !== undefined) this.cancelRequest(authorizeId, verifier)
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
    }
  }

  private rejectPayload(stage: string, error: z.ZodError): never {
    console.info('[deepseek-account] payload rejected', {
      stage, issues: error.issues.map(issue => ({
        path: issue.path, code: issue.code,
        receivedType: issue.input === null ? 'null' : Array.isArray(issue.input) ? 'array' : typeof issue.input,
      })),
    })
    throw new PlatformAuthError('protocol')
  }

  private cancelRequest(authorizeId: string, verifier: string): void {
    if (this.closed) return
    const cancellation = requestPlatform(this.origin, 'auth_cancel', { authorize_id: authorizeId, code_verifier: verifier },
      this.logoutLifetime.signal).then(() => undefined, () => undefined)
      .finally(() => { /* best effort */ })
    void cancellation
  }

  // ---- sign-out --------------------------------------------------------------

  /** Remove the local grant; revoke it remotely in the background. */
  private async signOut(): Promise<void> {
    this.removing ??= (async () => {
      if (this.closed) throw new PlatformAuthError('protocol')
      if (this.attempt !== undefined) await this.cancelSignIn()
      const record = await this.ctx.credentials.readRecord(KEY)
      if (record !== undefined) {
        if (record.kind !== 'grant') throw new PlatformAuthError('storage')
        const parsed = grant.safeParse(record.payload)
        if (!parsed.success) throw new PlatformAuthError('storage')
        if (parsed.data.issuer !== this.origin) throw new PlatformAuthError('protocol')
        await this.ctx.credentials.deleteRecord(KEY)
        void revokeAccount(this.origin, parsed.data.token, this.logoutPolicy, this.logoutLifetime.signal)
          .finally(() => { /* background revocation */ })
      }
      this.signedIn = false
      this.profileCache = null
      // Session-scoped adoption: drop the managed `models` value so the
      // models page's visibility rule no longer pins the group once the
      // live catalog empties out on sign-out.
      await this.ctx.settings.mutate(this.settingsNs, [{ op: 'unset', path: ['models'] }])
      this.publish()
    })().finally(() => { this.removing = undefined })
    await this.removing
  }

  // ---- model scanning --------------------------------------------------------

  /** Query the inference origin's model list and persist it into the plugin config. */
  private async scanModels(): Promise<JsonValue> {
    const stored = await this.readCurrentGrant()
    if (stored === null) throw new Error('请先登录 DeepSeek 账号再扫描模型。')
    let response: Response
    try {
      response = await fetch(`${this.inferenceOrigin}/models`, {
        headers: { ...clientHeaders(), 'x-dsh-auth-token': stored.token },
        signal: AbortSignal.any([this.logoutLifetime.signal, AbortSignal.timeout(this.requestTimeoutMs)]),
      })
    } catch (error) {
      throw new Error(`模型扫描失败：${error instanceof Error ? error.message : String(error)}`)
    }
    if (response.status === 401) {
      await response.body?.cancel()
      await this.expireCredential(stored.token)
      throw new Error('模型扫描失败：登录已过期，请重新登录。')
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`模型扫描失败：HTTP ${String(response.status)}`)
    }
    const payload = await response.json() as { data?: { id?: unknown }[] }
    const ids = (payload.data ?? [])
      .map(row => typeof row?.id === 'string' ? row.id : '')
      .filter(id => id !== '')
    if (ids.length === 0) throw new Error('模型扫描失败：响应不含模型清单。')
    const models: DeepSeekCatalogModel[] = ids.map(id => ({
      id, name: id,
      contextWindow: DEFAULT_CONTEXT_WINDOW,
      maxTokens: DEFAULT_MAX_TOKENS,
      inputModalities: ['text'],
      imagePixelBudget: 'low',
      imageMaxBytes: 1,
    }))
    const settings = this.ctx.get('settings')
    if (settings === undefined) throw new Error('模型扫描失败：设置服务不可用。')
    await settings.mutate(this.settingsNs, [{ op: 'set', path: ['models'], value: models }])
    return { message: `发现 ${String(ids.length)} 个模型：${ids.join('、')}。已写入配置，模型页账号分组即可选用。` }
  }
}
