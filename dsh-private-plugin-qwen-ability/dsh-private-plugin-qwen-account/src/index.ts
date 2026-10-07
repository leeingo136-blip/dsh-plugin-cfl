/**
 * Qwen account component of `dsh-private-plugin-qwen-ability`.
 *
 * One account product the harness core does not ship: the Qwen OAuth login
 * (RFC 8628 device-authorization grant with PKCE, mirroring the qwen-code
 * CLI client), the rotating token pair it yields, and the account-hub
 * registration whose declarative card renders the whole settings row.
 *
 * Work mode is credential-inject in its purest form: the account mounts its
 * own models-page route on the harness's pi-ai adapter family, speaking
 * `openai-completions` against the `resource_url` the tokens are bound to
 * (DashScope's OpenAI-compatible endpoint by default). There is no static
 * key to inject — the adapter's `resolveApiKey` calls back into this service,
 * which refreshes the access token lazily (in-flight deduplicated) before
 * handing it over, exactly the semantics qwen-code's SharedTokenManager
 * gives the CLI. A rejected refresh (the server answering 400/401) expires
 * the login.
 *
 * The Qwen OAuth catalog serves exactly one model: `coder-model` (Qwen 3.7
 * Max, vision-capable hybrid). Model discovery probes the endpoint's
 * `GET /models` for the adopted catalog.
 *
 * One component among this plugin's, mounted by the deployment patch row
 * whose `name:` is this package — deliberately outside any agent preset: an
 * account is something the user installs, not something a conversation
 * switches on.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import { LlmError, resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type {} from '@dsh-private/api-account-hub'
import { ACCOUNT_HUB_CHANGED } from '@dsh-private/api-account-hub'
import type { AccountHubCardState } from '@dsh-private/api-account-hub'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { openNativePath } from '@deepseek-ai/dsh-native-command'
import { z } from 'zod'
import zschema from '@deepseek-ai/schemastery'
import { CARD } from './card.ts'
import { emptyCredentialStore, resolveOpenAiProfile, staticAuthContext } from './pi-ai-bridge.ts'
import {
  DEFAULT_RESOURCE_URL, QWEN_OAUTH_BASE_URL, generatePkcePair, pollDeviceToken, readModels,
  refreshAccessToken, requestDeviceAuthorization,
} from './protocol.ts'

/** Stable identity: hub account id and entry id fallback. */
export const name = 'qwen-account-external'
const ID = name

/** The stored login fact: the rotating token pair plus the endpoint binding. */
const grant = z.object({
  version: z.literal(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  resourceUrl: z.string().min(1).optional(),
  /** Absolute epoch ms when the access token expires. */
  expiresAt: z.number(),
})
type StoredGrant = z.infer<typeof grant>

const ATTEMPT_TIMEOUT_MS = 600_000
const REQUEST_TIMEOUT_MS = 30_000
/** Refresh when the access token is within this margin of expiring. */
const REFRESH_MARGIN_MS = 5 * 60_000

/** The pi-ai route this account mounts. */
const ROUTE = 'Qwen-account'
/** The credential reference the profile names (the token is served per
 *  request by the resolve override; the reference exists for surfaces that
 *  render a credential name). */
const DEFAULT_CREDENTIAL_REF_NAME = 'QWEN_ACCESS_TOKEN'

/** The OAuth catalog's fixed model: the official client hard-declares it and
 *  rejects everything else. */
const DEFAULT_ROUTE_MODELS: readonly ModelRow[] = [
  { id: 'coder-model', name: 'Qwen 3.7 Max (coder-model)', contextWindow: 262_144, maxTokens: 32_768 },
]

/** One adopted catalog row, mirroring the official model-list editor. */
export interface ModelRow {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  input?: string[]
}

const MODEL_MODALITIES = ['text', 'image'] as const

const modelRow = zschema.object({
  id: zschema.string().required(),
  name: zschema.string(),
  contextWindow: zschema.number().step(1).min(1),
  maxTokens: zschema.number().step(1).min(1),
  input: zschema.array(zschema.union([...MODEL_MODALITIES])),
})

/** A volatile Config field arrives from schemastery as a frozen lazy box. */
export interface VolatileBox<T> {
  readonly get: () => T
}

/**
 * Plugin configuration. Built with the harness schemastery `z` (NOT zod) and
 * every field `.volatile()`: the settings service projects only volatile
 * fields into the namespace form, and the hub registration pairs with that
 * namespace. The adopted model catalog lives at the namespace root's
 * `models` key — exactly where the models page's editor writes it for a
 * route whose `settingsPath` is empty.
 */
export interface Config {
  apiKeyEnv?: VolatileBox<string>
  models?: VolatileBox<ModelRow[]>
}

export const Config = zschema.object({
  apiKeyEnv: zschema.string().volatile(),
  models: zschema.array(modelRow).volatile(),
})

/** The brand line both card states draw. */
const BRAND = Object.freeze({ name: 'Qwen 账号' })

/** One sign-in attempt's observable phase. */
type Phase = 'requesting' | 'waiting-approval' | 'polling' | 'committing'

const PHASE_TEXT: { [P in Phase]: string } = {
  requesting: '登录中：请求设备授权…',
  'waiting-approval': '登录中：请在浏览器中确认授权…',
  polling: '登录中：等待授权确认…',
  committing: '登录中：写入凭据…',
}

/**
 * The account service. Hosting services (llm, credentials, accountHub) arrive
 * through injection; the plugin registers its route and hub card in its
 * constructor and re-ingests the stored sign-in on init.
 */
export default class QwenAccountExternal extends Service {
  static inject = ['llm', 'credentials', 'accountHub', 'settings']
  static Config = Config

  private readonly settingsNs: string
  private readonly config: Config
  private readonly requestLifetime = new AbortController()

  private signedIn = false
  private profileCache: StoredGrant | null = null
  /** Lazy-refresh in-flight guard: one refresh at a time, everyone awaits it. */
  private tokenRefresh: Promise<string> | undefined
  private attemptText: string | undefined
  private attemptHint: string | undefined
  private removing: Promise<void> | undefined
  private view: AccountHubCardState = { text: '未登录', level: 'warn', signedIn: false, brand: BRAND }

  /** @param ctx - host context. @param config - plugin configuration. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'qwenAccount')
    this.settingsNs = ctx.fiber?.entry?.options.id ?? ID
    this.config = config

    ctx.on('credentials/record-updated', (key: CredentialKey) => {
      if (key !== GRANT) return
      void this.ingestStoredState()
    })

    ctx.effect(() => () => { this.requestLifetime.abort() }, 'qwen-account-external: request lifetime')

    this.registerProvider(ctx)
    this.registerHub(ctx)
    this.publish()
  }

  async [Service.init](): Promise<void> {
    await this.ingestStoredState()
  }

  // ---- configuration reads --------------------------------------------------

  /** The credential reference name the profile renders. */
  get credentialRefName(): string {
    const configured = this.config.apiKeyEnv?.get()?.trim()
    return configured === undefined || configured === '' ? DEFAULT_CREDENTIAL_REF_NAME : configured
  }

  /** The adopted model catalog, if any. */
  get adoptedModelsValue(): readonly ModelRow[] {
    return this.config.models?.get() ?? []
  }

  // ---- token lifecycle --------------------------------------------------------

  private async readGrant(): Promise<StoredGrant | null> {
    const record = await this.ctx.credentials.readRecord(GRANT)
    if (record?.kind !== 'grant') return null
    const parsed = grant.safeParse(record.payload)
    return parsed.success ? parsed.data : null
  }

  private async storeGrant(next: StoredGrant): Promise<void> {
    await this.ctx.credentials.modifyRecord(GRANT, () =>
      Promise.resolve({ kind: 'grant' as const, payload: next }))
  }

  /**
   * The current access token, refreshed lazily when inside the expiry margin
   * (qwen-code's SharedTokenManager semantics). Concurrent callers share one
   * in-flight refresh; a rejected refresh expires the login — the server
   * answering 400/401 means the refresh token itself is dead.
   */
  private async ensureFreshToken(): Promise<string> {
    const stored = await this.readGrant()
    if (stored === null) {
      throw new LlmError('Qwen 账号还没有登录：请先在账号页完成设备码登录。', 'MISSING_CREDENTIAL')
    }
    if (Date.now() < stored.expiresAt - REFRESH_MARGIN_MS) return stored.accessToken
    this.tokenRefresh ??= (async (): Promise<string> => {
      const current = await this.readGrant()
      if (current === null) throw new LlmError('Qwen 账号已退出登录。', 'MISSING_CREDENTIAL')
      if (Date.now() < current.expiresAt - REFRESH_MARGIN_MS) return current.accessToken
      try {
        const fresh = await refreshAccessToken({
          refresh_token: current.refreshToken,
          signal: this.requestLifetime.signal,
        })
        const next: StoredGrant = {
          version: 1,
          accessToken: fresh.accessToken,
          refreshToken: fresh.refreshToken ?? current.refreshToken,
          resourceUrl: fresh.resourceUrl ?? current.resourceUrl,
          expiresAt: fresh.expiresAt,
        }
        await this.storeGrant(next)
        this.profileCache = next
        return next.accessToken
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // A rejected refresh token is a dead login; anything else (network,
        // timeout) stays a transient failure the next request retries.
        if (/\b(400|401)\b/.test(message)) {
          await this.signOut().catch(() => undefined)
          throw new LlmError('Qwen 登录已失效（令牌刷新被拒绝），请重新登录。', 'CREDENTIAL_EXPIRED')
        }
        throw error
      }
    })().finally(() => { this.tokenRefresh = undefined })
    return this.tokenRefresh
  }

  // ---- route registration -----------------------------------------------------

  private routeProfiles(): ReadonlyMap<string, ResolvedPiAiProviderProfile> {
    const models = this.adoptedModelsValue
    const signedIn = this.signedIn
    const key = JSON.stringify([signedIn, this.credentialRefName, models])
    const cached = this.routeProfileValue
    if (this.routeProfileKey !== key || cached === undefined) {
      const next = new Map<string, ResolvedPiAiProviderProfile>()
      // While signed out the route stays **owned but empty**: a missing
      // profile would make `listModels` throw NO_ADAPTER, which the desktop
      // model selector renders as a「加载失败」warning bar.
      const baseUrl = this.routeBaseUrlCache
      next.set(ROUTE, resolveOpenAiProfile({
        provider: ROUTE,
        displayName: 'Qwen 账号',
        baseURL: baseUrl,
        apiKeyEnv: this.credentialRefName,
        models: signedIn
          ? (models.length > 0 ? models : DEFAULT_ROUTE_MODELS).map(row => ({
            id: row.id,
            ...(row.name === undefined ? {} : { name: row.name }),
            ...(row.contextWindow === undefined ? {} : { contextWindow: row.contextWindow }),
            ...(row.maxTokens === undefined ? {} : { maxTokens: row.maxTokens }),
          }))
          : [],
      }))
      this.routeProfileValue = next
      this.routeProfileKey = key
    }
    return this.routeProfileValue as ReadonlyMap<string, ResolvedPiAiProviderProfile>
  }

  private routeProfileKey = ''
  private routeProfileValue: ReadonlyMap<string, ResolvedPiAiProviderProfile> | undefined
  /** The endpoint the current profile was built against (refreshed on ingest). */
  private routeBaseUrlCache = DEFAULT_RESOURCE_URL

  private registerProvider(ctx: Context): void {
    ctx.llm.registerConfigurableProviders([
      {
        provider: ROUTE,
        displayName: 'Qwen 账号',
        settingsNs: this.settingsNs,
        settingsPath: [],
        accountProvider: true,
      },
    ])
    ctx.llm.registerAdapter([ROUTE], new PiAiAdapter({
      profiles: () => this.routeProfiles(),
      resolveApiKey: async (_provider, _profile) => {
        // Per-request lazy refresh: the adapter resolves the key for every
        // request, so the handed-out token is always the freshest known.
        return this.ensureFreshToken()
      },
      auth: { credentials: emptyCredentialStore(), authContext: staticAuthContext() },
      resolveAttachments: () => ctx.get('attachments'),
      resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(
        attachments,
        hostPath => ctx.get('fs')?.processPathFromHostPath(hostPath),
        ref,
      ),
    }))
    ctx.llm.registerModelDiscovery(this.settingsNs, async (request): Promise<readonly LlmDiscoveredModel[]> => {
      const token = await this.ensureFreshToken()
      const stored = await this.readGrant()
      const baseUrl = typeof request.baseURL === 'string' && request.baseURL.trim() !== ''
        ? request.baseURL.trim()
        : (stored?.resourceUrl?.trim() || DEFAULT_RESOURCE_URL)
      const signal = AbortSignal.any([this.requestLifetime.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      const ids = await readModels({ baseUrl: baseUrl.replace(/\/+$/, ''), token, signal })
      if (ids.length === 0) throw new LlmError('该账号下没有可用模型。', 'QWEN_NO_MODELS')
      return ids.map(id => ({ id, name: id }))
    })
  }

  // ---- hub registration -------------------------------------------------------

  private registerHub(ctx: Context): void {
    const dispose = ctx.accountHub.register({
      id: ID,
      displayName: 'Qwen 账号',
      settingsNs: this.settingsNs,
      provider: ROUTE,
      modelsCard: true,
      workMode: 'credential-inject',
      card: CARD,
      invoke: (method: string) => this.invoke(method),
      getState: () => this.view as unknown as JsonValue,
    })
    ctx.effect(() => dispose, 'qwen-account-external: hub registration')
  }

  /** Forward one hub-card operation to its implementation. */
  private async invoke(method: string): Promise<JsonValue> {
    switch (method) {
      case 'sign-in': {
        await this.startDeviceSignIn()
        return { message: this.view.text ?? '已登录' }
      }
      case 'sign-out': {
        await this.signOut()
        return { message: '已退出登录。' }
      }
      default: throw new Error(`未知账号操作 "${method}"`)
    }
  }

  // ---- published state --------------------------------------------------------

  /** Recompute the hub-visible state: an in-flight attempt, the signed-in
   *  fact, or the signed-out brand row. */
  private publish(): void {
    if (this.attemptText !== undefined) {
      // A waiting attempt carries the verification URL and user code in the
      // hint, so a manual (no-browser) sign-in still has everything on card.
      this.view = {
        text: this.attemptHint ?? this.attemptText,
        level: 'warn', signedIn: false, signingIn: true, brand: BRAND,
      }
    } else if (this.signedIn) {
      const resource = this.profileCache?.resourceUrl?.replace(/\/+$/, '') ?? DEFAULT_RESOURCE_URL
      this.view = {
        text: '已登录 · Qwen OAuth',
        level: 'ok',
        signedIn: true,
        brand: BRAND,
        identity: {
          name: 'Qwen 账号',
          infoLabel: '授权页',
          infoUrl: `${QWEN_OAUTH_BASE_URL}/`,
        },
        balance: {
          rows: [{ label: '推理端点', value: resource }],
          more: [{ label: '更多', links: [{ label: 'Qwen 控制台', href: `${QWEN_OAUTH_BASE_URL}/`, primary: true }] }],
        },
      }
    } else {
      this.view = { text: '未登录', level: 'warn', signedIn: false, brand: BRAND }
    }
    this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
  }

  private setPhase(phase: Phase | undefined, hint?: string): void {
    this.attemptText = phase === undefined ? undefined : PHASE_TEXT[phase]
    this.attemptHint = hint
    this.publish()
  }

  // ---- stored state -----------------------------------------------------------

  /** Re-read the stored login and republish; refreshes the route profile's
   *  endpoint binding. */
  private async ingestStoredState(): Promise<void> {
    const stored = await this.readGrant()
    if (stored === null) {
      this.signedIn = false
      this.profileCache = null
      this.publish()
      return
    }
    this.signedIn = true
    this.profileCache = stored
    this.routeBaseUrlCache = (stored.resourceUrl?.trim() || DEFAULT_RESOURCE_URL).replace(/\/+$/, '')
    this.routeProfileKey = ''
    this.publish()
  }

  private async forgetCredential(): Promise<void> {
    await this.ctx.credentials.deleteRecord(GRANT)
    this.signedIn = false
    this.profileCache = null
    this.routeBaseUrlCache = DEFAULT_RESOURCE_URL
    this.routeProfileKey = ''
    this.publish()
  }

  // ---- device sign-in -----------------------------------------------------------

  /**
   * One device-authorization attempt: request the device grant, open the
   * verification URL in the browser, and poll until the user approves. The
   * gesture fails soft on a missing browser — the URL and user code stay in
   * the attempt view for manual use.
   */
  private async startDeviceSignIn(): Promise<void> {
    if (this.attemptText !== undefined) return

    const deadline = new AbortController()
    const timer = setTimeout(() => { deadline.abort() }, ATTEMPT_TIMEOUT_MS)
    const signal = AbortSignal.any([this.requestLifetime.signal, deadline.signal])

    try {
      this.setPhase('requesting')
      const pkce = generatePkcePair()
      const deviceAuth = await requestDeviceAuthorization({ code_challenge: pkce.code_challenge, signal })

      this.setPhase('waiting-approval')
      void openNativePath(deviceAuth.verification_uri_complete, signal).catch((error: unknown) => {
        console.info('[qwen-account] browser open failed', {
          error: error instanceof Error ? error.message : String(error),
          verificationUrl: deviceAuth.verification_uri_complete,
        })
      })

      this.setPhase('polling', `授权地址：${deviceAuth.verification_uri}  用户码：${deviceAuth.user_code}`)
      const tokenSet = await this.pollUntilAuthorized(deviceAuth.device_code, pkce.code_verifier, deviceAuth.expires_in, signal)

      this.setPhase('committing')
      const stored: StoredGrant = {
        version: 1,
        accessToken: tokenSet.accessToken,
        refreshToken: tokenSet.refreshToken ?? '',
        ...(tokenSet.resourceUrl === undefined ? {} : { resourceUrl: tokenSet.resourceUrl }),
        expiresAt: tokenSet.expiresAt,
      }
      if (stored.refreshToken === '') {
        // The server always issues one on this grant; refuse to store a
        // login that could never refresh.
        throw new Error('授权响应缺少 refresh_token，请重试。')
      }
      await this.storeGrant(stored)
      this.signedIn = true
      this.profileCache = stored
      this.routeBaseUrlCache = (stored.resourceUrl?.trim() || DEFAULT_RESOURCE_URL).replace(/\/+$/, '')
      this.routeProfileKey = ''
      this.setPhase(undefined)
    } catch (error) {
      this.setPhase(undefined)
      this.view = {
        text: signal.aborted ? '登录超时，请重试。' : error instanceof Error ? error.message : '登录失败',
        level: 'error',
        signedIn: false,
        brand: BRAND,
      }
      this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  /** Poll the token endpoint until approval, backing off on `slow_down`. */
  private async pollUntilAuthorized(
    deviceCode: string,
    codeVerifier: string,
    expiresIn: number,
    signal: AbortSignal,
  ): Promise<{ accessToken: string; refreshToken?: string; resourceUrl?: string; expiresAt: number }> {
    let intervalMs = 2000
    const deadline = Date.now() + expiresIn * 1000
    for (;;) {
      signal.throwIfAborted()
      if (Date.now() >= deadline) throw new Error('登录超时，请重试。')
      const poll = await pollDeviceToken({ device_code: deviceCode, code_verifier: codeVerifier, signal })
      if (poll.status === 'success') {
        return {
          accessToken: poll.accessToken,
          ...(poll.refreshToken === undefined ? {} : { refreshToken: poll.refreshToken }),
          ...(poll.resourceUrl === undefined ? {} : { resourceUrl: poll.resourceUrl }),
          expiresAt: poll.expiresAt,
        }
      }
      if (poll.slowDown === true) intervalMs = Math.min(intervalMs * 2, 30_000)
      await new Promise<void>((resolve, reject) => {
        const onAbort = (): void => { clearTimeout(timer); reject(signal.reason) }
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort)
          resolve()
        }, intervalMs)
        signal.addEventListener('abort', onAbort, { once: true })
      })
    }
  }

  /** Drop the local login. A remote revocation is not attempted. */
  private async signOut(): Promise<void> {
    this.removing ??= this.forgetCredential().finally(() => { this.removing = undefined })
    await this.removing
  }
}

/** The credential record key this account's login lives under. */
const GRANT = credentialKey(ID, 'grant')
