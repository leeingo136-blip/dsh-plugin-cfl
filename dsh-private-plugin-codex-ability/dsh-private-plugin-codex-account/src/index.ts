/**
 * Codex account component of `dsh-private-plugin-codex-ability`.
 *
 * One account product the harness core does not ship: the Codex login and
 * the account-hub registration whose declarative card renders the whole
 * settings row. Both auth modes mirror `codex login` (openai/codex,
 * Apache-2.0):
 *
 * - **ChatGPT subscription**: the OAuth authorization-code + PKCE flow. The
 *   card's sign-in gesture builds the authorize URL, opens the browser, and
 *   serves the `127.0.0.1:1455/auth/callback` catch; the exchanged token set
 *   (access / refresh / id) is stored in the credentials store and the
 *   access token is refreshed lazily on the request path. Subscription
 *   requests carry Codex's attribution headers (`originator`,
 *   `chatgpt-account-id`).
 * - **OpenAI Platform API key**: pasted against the Responses API endpoint,
 *   with the paste field mirrored into the credentials store exactly like
 *   the Qwen account's.
 *
 * Work mode is credential-inject in its purest form: the account mounts its
 * own models-page route on the harness's pi-ai adapter family, and the
 * adapter's `resolveApiKey` calls back into this service, which resolves the
 * mode's credential per request.
 *
 * One component among this plugin's, mounted by the deployment patch row
 * whose `name:` is this package — deliberately outside any agent preset: an
 * account is something the user installs, not something a conversation
 * switches on.
 */

import { createServer } from 'node:http'
import type { Server, IncomingMessage, ServerResponse } from 'node:http'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import { LlmError, resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {} from '@dsh-private/api-account-hub'
import { ACCOUNT_HUB_CHANGED } from '@dsh-private/api-account-hub'
import type { AccountHubCardState } from '@dsh-private/api-account-hub'
import { openNativePath } from '@deepseek-ai/dsh-native-command'
import zschema from '@deepseek-ai/schemastery'
import { CARD } from './card.ts'
import { emptyCredentialStore, resolveOpenAiResponsesProfile, staticAuthContext } from './pi-ai-bridge.ts'
import {
  API_KEY_BASE_URL, CALLBACK_PATH, CALLBACK_PORT, CHATGPT_BASE_URL, CONSOLE_URL,
  ORIGINATOR, buildAuthorizeUrl, exchangeCode, generatePkce, parseIdTokenClaims, readModels, refreshTokens,
} from './protocol.ts'

/** Stable identity: hub account id and entry id fallback. */
export const name = 'codex-account-external'
const ID = name

const REQUEST_TIMEOUT_MS = 30_000
/** The OAuth callback catch window (codex-rs polls its login server 15 min). */
const LOGIN_TIMEOUT_MS = 15 * 60_000
/** Refresh the access token when it expires within this horizon. */
const REFRESH_SKEW_MS = 5 * 60_000

/** The pi-ai route this account mounts. */
const ROUTE = 'Codex-account'
/** The credential reference name the profile renders. */
const DEFAULT_CREDENTIAL_REF_NAME = 'CODEX_CREDENTIAL'

/** The subscription route's dependable defaults; the ChatGPT backend has no
 *  portable catalog endpoint, so this table is the signed-in catalog. */
const CHATGPT_MODELS: readonly ModelRow[] = [
  { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', contextWindow: 272_000, maxTokens: 128_000 },
  { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max', contextWindow: 272_000, maxTokens: 128_000 },
  { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', contextWindow: 272_000, maxTokens: 128_000 },
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
  mode?: VolatileBox<string>
  apiKey?: VolatileBox<string>
  customBaseUrl?: VolatileBox<string>
  models?: VolatileBox<ModelRow[]>
}

/** The schema class instance type, nameable without dragging cosmokit into
 *  the declaration surface (any raw `object()` inference is not — its type
 *  intersects cosmokit's `Dict`). */
type SchemaNode = InstanceType<typeof zschema>

/** The configuration schema. The value is the plain schemastery object (the
 *  dropdown and volatile fields render untouched); the assertion only keeps
 *  the emitted declaration portable. */
export const Config = zschema.object({
  mode: zschema.union(['ChatGPT 订阅（OAuth）', 'API Key（OpenAI Platform）']).volatile(),
  apiKey: zschema.string().volatile(),
  customBaseUrl: zschema.string().volatile(),
  models: zschema.array(modelRow).volatile(),
}) as unknown as SchemaNode

/** The brand line both card states draw. */
const BRAND = Object.freeze({ name: 'Codex 账号' })

/** The credential record keys. */
const OAUTH_GRANT = credentialKey(ID, 'grant-oauth')
const APIKEY_GRANT = credentialKey(ID, 'grant-key')

/** The two auth modes, keyed by their config labels. */
const MODE_CHATGPT = 'ChatGPT 订阅（OAuth）'
const MODE_APIKEY = 'API Key（OpenAI Platform）'

/** The stored OAuth token set (the `codex` login's auth.json, transplanted). */
interface StoredOAuth {
  readonly version: 1
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: number
  readonly accountId: string
  readonly plan?: string
  readonly email?: string
}

/** The stored Platform key mirror. */
interface StoredApiKey {
  readonly version: 1
  readonly apiKey: string
}

/**
 * The account service. Hosting services (llm, accountHub, settings,
 * credentials) arrive through injection; the plugin registers its route and
 * hub card in its constructor, and re-ingests whenever the configuration or
 * a credential record moves.
 */
export default class CodexAccountExternal extends Service {
  static inject = ['llm', 'accountHub', 'settings', 'credentials']
  static Config = Config

  private readonly settingsNs: string
  private readonly config: Config
  private readonly requestLifetime = new AbortController()

  /** The credential facts, re-read by ingest. */
  private oauth: StoredOAuth | null = null
  private apiKeyStored: StoredApiKey | null = null
  private view: AccountHubCardState = { text: '未登录', level: 'warn', signedIn: false, brand: BRAND }

  /** Lazy refresh dedup: one in-flight refresh per token generation. */
  private refreshInFlight: Promise<string> | null = null

  /** @param ctx - host context. @param config - plugin configuration. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'codexAccount')
    this.settingsNs = ctx.fiber?.entry?.options.id ?? ID
    this.config = config

    ctx.on('settings/document-updated', (ns: string) => {
      if (ns !== this.settingsNs) return
      void this.ingest()
    })
    ctx.on('credentials/record-updated', (key: CredentialKey) => {
      if (key !== OAUTH_GRANT && key !== APIKEY_GRANT) return
      void this.refreshStored()
    })

    ctx.effect(() => () => { this.requestLifetime.abort() }, 'codex-account-external: request lifetime')

    this.registerProvider(ctx)
    this.registerHub(ctx)
    void this.ingest()
  }

  // ---- configuration reads --------------------------------------------------

  /** The selected auth mode's config label. */
  get modeValue(): string {
    const mode = this.config.mode?.get()?.trim() ?? ''
    return mode === MODE_APIKEY ? MODE_APIKEY : MODE_CHATGPT
  }

  get isChatGptMode(): boolean {
    return this.modeValue === MODE_CHATGPT
  }

  /** The pasted Platform API key, or '' when the field is empty. */
  get apiKeyValue(): string {
    return this.config.apiKey?.get()?.trim() ?? ''
  }

  /** Whether a login fact exists for the selected mode. */
  get signedIn(): boolean {
    return this.isChatGptMode ? this.oauth !== null : (this.apiKeyValue !== '' || this.apiKeyStored !== null)
  }

  /** The endpoint the selected mode serves. A non-empty custom base URL wins
   *  over the mode default (the escape hatch for gateways and proxies). */
  get baseUrlValue(): string {
    const custom = this.config.customBaseUrl?.get()?.trim() ?? ''
    if (custom !== '') return custom.replace(/\/+$/, '')
    return (this.isChatGptMode ? CHATGPT_BASE_URL : API_KEY_BASE_URL).replace(/\/+$/, '')
  }

  /** The adopted model catalog, if any. */
  get adoptedModelsValue(): readonly ModelRow[] {
    return this.config.models?.get() ?? []
  }

  /** The credential reference name the profile renders. */
  get credentialRefName(): string {
    return DEFAULT_CREDENTIAL_REF_NAME
  }

  // ---- credential store -------------------------------------------------------

  private async readOAuth(): Promise<StoredOAuth | null> {
    const record = await this.ctx.credentials.readRecord(OAUTH_GRANT)
    if (record?.kind !== 'grant') return null
    const payload = record.payload as Partial<StoredOAuth> | undefined
    if (typeof payload?.accessToken !== 'string' || payload.accessToken === '') return null
    return {
      version: 1,
      accessToken: payload.accessToken,
      refreshToken: typeof payload.refreshToken === 'string' ? payload.refreshToken : '',
      expiresAt: typeof payload.expiresAt === 'number' ? payload.expiresAt : 0,
      accountId: typeof payload.accountId === 'string' ? payload.accountId : '',
      ...(typeof payload.plan === 'string' ? { plan: payload.plan } : {}),
      ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
    }
  }

  private async readApiKeyGrant(): Promise<StoredApiKey | null> {
    const record = await this.ctx.credentials.readRecord(APIKEY_GRANT)
    if (record?.kind !== 'grant') return null
    const payload = record.payload as Partial<StoredApiKey> | undefined
    if (typeof payload?.apiKey !== 'string' || payload.apiKey === '') return null
    return { version: 1, apiKey: payload.apiKey }
  }

  /** Re-read both stored records and republish (credential-side changes). */
  private async refreshStored(): Promise<void> {
    this.oauth = await this.readOAuth()
    this.apiKeyStored = await this.readApiKeyGrant()
    this.routeProfileKey = ''
    this.publish()
  }

  /** Sync the pasted Platform key into its mirror (config-driven; the OAuth
   *  side is written by the login flow instead). */
  private async ingest(): Promise<void> {
    const pasted = this.apiKeyValue
    const stored = await this.readApiKeyGrant()
    if (pasted !== '') {
      if (stored === null || stored.apiKey !== pasted) {
        const next: StoredApiKey = { version: 1, apiKey: pasted }
        await this.ctx.credentials.modifyRecord(APIKEY_GRANT, () => Promise.resolve({ kind: 'grant' as const, payload: next }))
        this.apiKeyStored = next
      }
    } else if (stored !== null) {
      // The paste field was cleared: drop the mirror with it.
      await this.ctx.credentials.deleteRecord(APIKEY_GRANT)
      this.apiKeyStored = null
    }
    if (this.oauth === null) this.oauth = await this.readOAuth()
    this.routeProfileKey = ''
    this.publish()
  }

  // ---- credential resolution ----------------------------------------------------

  /**
   * The credential a request should present, resolved per the selected mode.
   * ChatGPT mode refreshes the access token lazily (one in-flight refresh at
   * a time; permanent refresh failures surface as a login error).
   */
  private async resolveKey(): Promise<string> {
    if (!this.isChatGptMode) {
      const stored = this.apiKeyStored?.apiKey ?? (await this.readApiKeyGrant())?.apiKey
      if (stored !== undefined && stored !== '') return stored
      const pasted = this.apiKeyValue
      if (pasted !== '') return pasted
      throw new LlmError('Codex 账号还没有 API Key：请在控制台创建后粘贴到本组件配置中。', 'MISSING_CREDENTIAL')
    }
    const oauth = this.oauth ?? await this.readOAuth()
    if (oauth === null) {
      throw new LlmError('Codex 账号还没有登录：点账号卡片上的「登录 ChatGPT 账号」完成授权。', 'MISSING_CREDENTIAL')
    }
    if (oauth.expiresAt - REFRESH_SKEW_MS > Date.now()) return oauth.accessToken
    if (oauth.refreshToken === '') {
      throw new LlmError('Codex 登录凭证已过期且没有可用的刷新令牌：请重新登录。', 'CREDENTIAL_EXPIRED')
    }
    if (this.refreshInFlight !== null) return this.refreshInFlight
    this.refreshInFlight = refreshTokens({ refreshToken: oauth.refreshToken, signal: this.requestLifetime.signal })
      .then(async (tokens) => {
        const claims = parseIdTokenClaims(tokens.id_token)
        const next: StoredOAuth = {
          version: 1,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token !== '' ? tokens.refresh_token : oauth.refreshToken,
          expiresAt: Date.now() + tokens.expires_in * 1000,
          accountId: claims.chatgpt_account_id ?? oauth.accountId,
          ...(claims.chatgpt_plan_type !== undefined ? { plan: claims.chatgpt_plan_type } :
            oauth.plan !== undefined ? { plan: oauth.plan } : {}),
          ...(claims.email !== undefined ? { email: claims.email } : oauth.email !== undefined ? { email: oauth.email } : {}),
        }
        await this.ctx.credentials.modifyRecord(OAUTH_GRANT, () => Promise.resolve({ kind: 'grant' as const, payload: next }))
        this.oauth = next
        this.routeProfileKey = ''
        this.publish()
        return next.accessToken
      })
      .finally(() => { this.refreshInFlight = null })
    return this.refreshInFlight
  }

  // ---- route registration -----------------------------------------------------

  /** The attribution headers the wire requires for the selected mode. */
  private routeHeaders(): Readonly<Record<string, string>> {
    if (!this.isChatGptMode) return {}
    const accountId = this.oauth?.accountId ?? ''
    return {
      originator: ORIGINATOR,
      'User-Agent': 'codex_cli_rs/codex-ability (DeepSeek Harness)',
      ...(accountId !== '' ? { 'chatgpt-account-id': accountId } : {}),
    }
  }

  private routeProfiles(): ReadonlyMap<string, ResolvedPiAiProviderProfile> {
    const models = this.adoptedModelsValue
    const signedIn = this.signedIn
    const baseUrl = this.baseUrlValue
    const headers = this.routeHeaders()
    const key = JSON.stringify([signedIn, baseUrl, this.credentialRefName, models, headers])
    const cached = this.routeProfileValue
    if (this.routeProfileKey !== key || cached === undefined) {
      const next = new Map<string, ResolvedPiAiProviderProfile>()
      // While signed out the route stays **owned but empty**: a missing
      // profile would make `listModels` throw NO_ADAPTER, which the desktop
      // model selector renders as a「加载失败」warning bar.
      next.set(ROUTE, resolveOpenAiResponsesProfile({
        provider: ROUTE,
        displayName: 'Codex 账号',
        baseURL: baseUrl,
        apiKeyEnv: this.credentialRefName,
        headers,
        models: signedIn
          ? (models.length > 0 ? models : this.isChatGptMode ? CHATGPT_MODELS : DEFAULT_APIKEY_MODELS).map(row => ({
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

  private registerProvider(ctx: Context): void {
    ctx.llm.registerConfigurableProviders([
      {
        provider: ROUTE,
        displayName: 'Codex 账号',
        settingsNs: this.settingsNs,
        settingsPath: [],
        accountProvider: true,
      },
    ])
    ctx.llm.registerAdapter([ROUTE], new PiAiAdapter({
      profiles: () => this.routeProfiles(),
      resolveApiKey: async (_provider, _profile) => this.resolveKey(),
      auth: { credentials: emptyCredentialStore(), authContext: staticAuthContext() },
      resolveAttachments: () => ctx.get('attachments'),
      resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(
        attachments,
        hostPath => ctx.get('fs')?.processPathFromHostPath(hostPath),
        ref,
      ),
    }))
    ctx.llm.registerModelDiscovery(this.settingsNs, async (request): Promise<readonly LlmDiscoveredModel[]> => {
      const key = await this.resolveKey()
      if (this.isChatGptMode) {
        throw new LlmError('ChatGPT 订阅模式使用内置 Codex 模型表，无需拉取目录。', 'CODEX_STATIC_MODELS')
      }
      const baseUrl = typeof request.baseURL === 'string' && request.baseURL.trim() !== ''
        ? request.baseURL.trim()
        : this.baseUrlValue
      const signal = AbortSignal.any([this.requestLifetime.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      const ids = await readModels({ baseUrl: baseUrl.replace(/\/+$/, ''), token: key, signal })
      if (ids.length === 0) throw new LlmError('该账号下没有可用模型。', 'CODEX_NO_MODELS')
      return ids.map(id => ({ id, name: id }))
    })
  }

  // ---- hub registration -------------------------------------------------------

  private registerHub(ctx: Context): void {
    const dispose = ctx.accountHub.register({
      id: ID,
      displayName: 'Codex 账号',
      settingsNs: this.settingsNs,
      provider: ROUTE,
      modelsCard: true,
      workMode: 'credential-inject',
      card: CARD,
      invoke: (method: string, args: JsonValue) => this.invoke(method, args),
      getState: () => this.view as unknown as JsonValue,
    })
    ctx.effect(() => dispose, 'codex-account-external: hub registration')
  }

  /** Forward one hub-card operation to its implementation. Dialog submits
   *  arrive as `{ values: { …card values, …dialog inputs } }` — the modal's
   *  `apiKey` input is the whole Platform-key sign-in. */
  private async invoke(method: string, args?: JsonValue): Promise<JsonValue> {
    switch (method) {
      case 'sign-in': {
        this.scheduleOauthLogin()
        return { message: '已打开 OpenAI 授权页：在浏览器完成登录后本页面会自动接住回调（本地端口 1455）。' }
      }
      case 'paste-key': {
        const values = (args !== null && typeof args === 'object' && 'values' in args
          ? (args as { values: Record<string, unknown> }).values
          : {}) ?? {}
        const pasted = typeof values.apiKey === 'string' ? values.apiKey.trim() : ''
        if (pasted === '') {
          return { message: '请先粘贴 OpenAI Platform API Key。', error: true }
        }
        await this.signInWithKey(pasted)
        return { message: '登录成功：API Key 已保存并同步到凭据管理，认证方式已切换为 API Key。', close: true }
      }
      case 'sign-out': {
        await this.signOut()
        return { message: '已退出登录：凭据记录与配置中的 API Key 均已清除。' }
      }
      default: throw new Error(`未知账号操作 "${method}"`)
    }
  }

  // ---- OAuth login flow ---------------------------------------------------------

  /**
   * Kick off one OAuth login: build the authorize URL, serve the local
   * callback catch, open the browser, and persist the exchanged tokens.
   * Fire-and-forget from the card's perspective — progress lands in the
   * published card state.
   */
  private scheduleOauthLogin(): void {
    void this.runOauthLogin().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      this.view = { text: `登录失败：${message}`, level: 'error', signedIn: false, brand: BRAND }
      this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
    })
  }

  private async runOauthLogin(): Promise<void> {
    const { verifier, challenge } = generatePkce()
    const state = generatePkce().verifier
    const redirectUri = `http://127.0.0.1:${CALLBACK_PORT}${CALLBACK_PATH}`

    const callback = this.serveCallback(state)
    try {
      await openNativePath(buildAuthorizeUrl({ challenge, state, redirectUri }), this.requestLifetime.signal)
    } catch (error) {
      console.info('[codex-account] browser open failed', {
        error: error instanceof Error ? error.message : String(error),
        authorizeUrl: buildAuthorizeUrl({ challenge, state, redirectUri }),
      })
    }
    this.view = {
      text: '等待浏览器授权回调（完成后自动保存令牌）…',
      level: 'warn',
      signedIn: false,
      brand: BRAND,
    }
    this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)

    try {
      const code = await callback.promise
      const tokens = await exchangeCode({
        code, verifier, redirectUri, signal: this.requestLifetime.signal,
      })
      const claims = parseIdTokenClaims(tokens.id_token)
      const stored: StoredOAuth = {
        version: 1,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        accountId: claims.chatgpt_account_id ?? '',
        ...(claims.chatgpt_plan_type === undefined ? {} : { plan: claims.chatgpt_plan_type }),
        ...(claims.email === undefined ? {} : { email: claims.email }),
      }
      await this.ctx.credentials.modifyRecord(OAUTH_GRANT, () => Promise.resolve({ kind: 'grant' as const, payload: stored }))
      this.oauth = stored
      this.routeProfileKey = ''
      this.publish()
    } finally {
      callback.close()
    }
  }

  /**
   * Serve the one callback catch on `127.0.0.1:1455`.
   * @param expectedState - the anti-CSRF state this flow sent.
   * @returns the awaited authorization code and a closer for the server.
   */
  private serveCallback(expectedState: string): { promise: Promise<string>; close(): void } {
    let server: Server | null = null
    const promise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('授权回调等待超时（15 分钟），请重试。'))
      }, LOGIN_TIMEOUT_MS)
      timer.unref?.()
      server = createServer((request: IncomingMessage, response: ServerResponse) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1')
        if (url.pathname !== CALLBACK_PATH) {
          response.writeHead(404).end()
          return
        }
        const error = url.searchParams.get('error')
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const finish = (status: number, body: string, settle: () => void): void => {
          response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
          response.end(body)
          clearTimeout(timer)
          server?.close()
          server = null
          settle()
        }
        if (error !== null) {
          finish(200, `<meta charset="utf-8"><title>Codex 登录</title><p>授权被拒绝：${error}，请回到应用重试。</p>`,
            () => reject(new Error(`授权被拒绝：${error}`)))
          return
        }
        if (code === null || state !== expectedState) {
          finish(400, '<meta charset="utf-8"><title>Codex 登录</title><p>回调参数无效。</p>',
            () => reject(new Error('授权回调参数无效（state 不匹配或缺少 code）。')))
          return
        }
        finish(200, '<meta charset="utf-8"><title>Codex 登录</title><p>授权成功，请回到 DeepSeek Harness 查看账号状态。</p>',
          () => resolve(code))
      })
      server.once('error', (error: NodeJS.ErrnoException) => {
        clearTimeout(timer)
        reject(new Error(error.code === 'EADDRINUSE'
          ? `本地回调端口 ${CALLBACK_PORT} 被占用（可能有另一个登录流程在跑），请稍后重试。`
          : `本地回调服务器启动失败：${error.message}`))
      })
      server.listen(CALLBACK_PORT, '127.0.0.1')
    })
    return { promise, close: () => { server?.close(); server = null } }
  }

  // ---- published state --------------------------------------------------------

  /** Recompute the hub-visible state: the signed-in fact or the signed-out
   *  brand row. */
  private publish(): void {
    if (this.isChatGptMode) {
      const oauth = this.oauth
      if (oauth !== null) {
        this.view = {
          text: '已登录 · ChatGPT 订阅',
          level: 'ok',
          signedIn: true,
          brand: BRAND,
          identity: {
            name: oauth.email !== undefined ? oauth.email : 'ChatGPT 账号',
            infoLabel: '控制台',
            infoUrl: 'https://chatgpt.com/#settings/Account',
          },
          balance: {
            rows: [
              { label: '认证方式', value: 'ChatGPT 订阅（OAuth）' },
              ...(oauth.plan !== undefined ? [{ label: '套餐', value: oauth.plan }] : []),
              { label: '推理端点', value: this.baseUrlValue },
            ],
            more: [{ label: '更多', links: [{ label: 'OpenAI Platform', href: CONSOLE_URL, primary: true }] }],
          },
        }
      } else {
        this.view = { text: '未登录', level: 'warn', signedIn: false, brand: BRAND }
      }
    } else if (this.signedIn) {
      this.view = {
        text: '已登录 · Platform API Key',
        level: 'ok',
        signedIn: true,
        brand: BRAND,
        identity: {
          name: 'OpenAI Platform',
          infoLabel: '控制台',
          infoUrl: CONSOLE_URL,
        },
        balance: {
          rows: [
            { label: '认证方式', value: 'API Key（OpenAI Platform）' },
            { label: '推理端点', value: this.baseUrlValue },
          ],
          more: [{ label: '更多', links: [{ label: 'OpenAI Platform', href: CONSOLE_URL, primary: true }] }],
        },
      }
    } else {
      this.view = { text: '未登录', level: 'warn', signedIn: false, brand: BRAND }
    }
    this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
  }

  // ---- sign-in / sign-out -------------------------------------------------------

  /** The Platform-key sign-in gesture: store the pasted key and flip the
   *  auth mode to API Key in one write. The settings event re-ingests,
   *  which mirrors the key into the credentials store — the same path a
   *  manual config edit takes. */
  private async signInWithKey(apiKey: string): Promise<void> {
    await this.ctx.settings.mutate(this.settingsNs, [
      { op: 'set', path: ['apiKey'], value: apiKey },
      { op: 'set', path: ['mode'], value: MODE_APIKEY },
    ])
    await this.ingest()
  }

  /** Clear every login fact: both credential records and the paste field. */
  private async signOut(): Promise<void> {
    await this.ctx.settings.mutate(this.settingsNs, [
      { op: 'unset', path: ['apiKey'] },
      { op: 'unset', path: ['customBaseUrl'] },
    ])
    await this.ctx.credentials.deleteRecord(OAUTH_GRANT)
    await this.ctx.credentials.deleteRecord(APIKEY_GRANT)
    this.oauth = null
    this.apiKeyStored = null
    this.routeProfileKey = ''
    this.publish()
  }
}

/** The Platform route's fallback defaults, used before any discovery run. */
const DEFAULT_APIKEY_MODELS: readonly ModelRow[] = [
  { id: 'gpt-5.2', name: 'GPT-5.2', contextWindow: 272_000, maxTokens: 128_000 },
  { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', contextWindow: 272_000, maxTokens: 128_000 },
]
