/**
 * Codex account component of `dsh-plugin-codex-ability`.
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
import { readFileSync } from 'node:fs'
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
import type {} from '@dsh/api-account-hub'
import { ACCOUNT_HUB_CHANGED } from '@dsh/api-account-hub'
import type { AccountHubCardState } from '@dsh/api-account-hub'
import { openNativePath } from '@deepseek-ai/dsh-native-command'
import zschema from '@deepseek-ai/schemastery'
import { CARD } from './card.ts'
import { detectExitRegion, localTimezone, regionLabel, timezoneMatchesRegion } from './regions.ts'
import type { ExitRegion } from './regions.ts'
import { emptyCredentialStore, resolveOpenAiResponsesProfile, staticAuthContext } from './pi-ai-bridge.ts'
import {
  API_KEY_BASE_URL, CALLBACK_PATH, CALLBACK_PORT, CHATGPT_BASE_URL, CONSOLE_URL,
  ORIGINATOR, buildAuthorizeUrl, codexUserAgent, exchangeCode, generatePkce, mergeWithBundledModels,
  parseIdTokenClaims, readChatGptModels, readModels, readWhamUsage, refreshTokens,
} from './protocol.ts'
import type { RemoteModelInfo, WhamUsage } from './protocol.ts'
import { BUNDLED_CHATGPT_MODELS } from './protocol.ts'

/** Stable identity: hub account id and entry id fallback. */
export const name = 'codex-account-external'
const ID = name

const REQUEST_TIMEOUT_MS = 30_000
/** The exit-probe retry cadence while every probe service stays unreachable
 *  (boot with the proxy not yet up, rate-limited shared exits, …). */
const EXIT_RETRY_MS = 15_000
/** The OAuth callback catch window (codex-rs polls its login server 15 min). */
const LOGIN_TIMEOUT_MS = 15 * 60_000
/** The rejection a superseded login flow carries: its own catch swallows
 *  exactly this message so the replacement flow keeps the card's view. */
const LOGIN_SUPERSEDED = '登录流程已被新的一次登录取代。'
/** Refresh the access token when it expires within this horizon. */
const REFRESH_SKEW_MS = 5 * 60_000

/** The pi-ai route this account mounts. */
const ROUTE = 'Codex-account'
/** The credential reference name the profile renders. */
const DEFAULT_CREDENTIAL_REF_NAME = 'CODEX_CREDENTIAL'

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
  /** The persisted 可用国家与地区 choice (ISO-style region code). Committed
   *  by the card's autoSave select; the geo gate compares it against the
   *  probed exit at sign-in and at every startup. */
  region?: VolatileBox<string>
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
  // A free string (region codes are too many for a union); the geo gate
  // validates the choice against the detected exit at sign-in and startup.
  region: zschema.string().volatile(),
}) as unknown as SchemaNode

/** The brand line both card states draw. */
/** The official OpenAI mark (the 2025 symbol SVG — the identity OpenAI
 *  applies to Codex across its product surfaces), bundled as a data URI. */
const LOGO_DATA_URI: string | undefined = (() => {
  try {
    const svg = readFileSync(new URL('../assets/codex-logo.svg', import.meta.url), 'utf8')
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
  } catch {
    return undefined
  }
})()

const BRAND = Object.freeze({ logoUrl: LOGO_DATA_URI, name: 'Codex 账号' })

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

  /** The login flow currently holding the 1455 listener, if any. A new
   *  login supersedes it (cancel-and-replace) instead of colliding on the
   *  fixed OAuth callback port. */
  private oauthLoginFlow: { cancel(): void } | undefined

  /** The credential facts, re-read by ingest. */
  private oauth: StoredOAuth | null = null
  private apiKeyStored: StoredApiKey | null = null
  private view: AccountHubCardState = { text: '未登录', level: 'warn', signedIn: false, brand: BRAND }

  /** Exit-region probe outcome, shown on the card's status line: 'pending'
   *  while probing, 'ok' with the detected facts, 'failed' when every probe
   *  timed out or errored. Beyond display it drives the geo gate: sign-in
   *  and every startup compare the persisted region choice against it. */
  private exitState: 'pending' | 'ok' | 'failed' = 'pending'
  private exit: ExitRegion | undefined
  /** Pending self-healing re-probe, cleared once a probe answers. */
  private exitRetry: ReturnType<typeof setTimeout> | undefined
  /** Why the startup geo gate auto-signed-out, shown on the signed-out card. */
  private geoNotice: string | undefined

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
    ctx.effect(() => () => {
      if (this.exitRetry !== undefined) clearTimeout(this.exitRetry)
    }, 'codex-account-external: exit retry timer')

    this.registerProvider(ctx)
    this.registerHub(ctx)
    void this.ingest()
    // The exit probe rides the plugin load, not a readiness gate: a slow or
    // dead probe service must not delay the plugin's readiness.
    void this.detectExit()
  }

  /** Probe the exit region once per load and republish, so the card's status
   *  line shows what the outside world sees as this machine's exit (IP +
   *  country/region) — or that the probe failed. Doubles as the startup geo
   *  enforcement: while a login fact exists, the persisted region choice must
   *  still match the freshly probed exit. A mismatch (or a missing choice)
   *  reverts to the signed-out state — both credential records are cleared,
   *  so nothing can connect afterwards until a matching region is chosen and
   *  a fresh sign-in happens. */
  private async detectExit(): Promise<void> {
    if (this.exitRetry !== undefined) { clearTimeout(this.exitRetry); this.exitRetry = undefined }
    const detected = await detectExitRegion()
    this.exit = detected
    this.exitState = detected === undefined ? 'failed' : 'ok'
    if (detected === undefined) {
      // Self-healing: the load-time probe can land before the network/proxy
      // is up, and shared exits exhaust the free echo services. Re-probe
      // until one answers, so the status line and the geo gate recover
      // without an app restart.
      this.exitRetry = setTimeout(() => { void this.detectExit() }, EXIT_RETRY_MS)
      this.publish()
      return
    }
    if (this.signedIn) {
      const persisted = this.config.region?.get()?.trim() ?? ''
      if (persisted !== detected.code) {
        this.geoNotice = persisted === ''
          ? `已自动退出：请先选择「可用国家与地区」（当前出口 ${detected.label}）。`
          : `已自动退出：出口 ${detected.label} 与所选地区「${regionLabel(persisted)}」不一致。`
        await this.signOut()
        return
      }
      // The same enforcement on the clock half: a login whose chosen region
      // stopped matching the machine's timezone is just as inconsistent as
      // one whose exit moved — revert to signed-out with the reason shown.
      const local = localTimezone()
      if (timezoneMatchesRegion(local, persisted) === false) {
        this.geoNotice = `已自动退出：本机时区（${local}）与所选地区「${regionLabel(persisted)}」不一致。`
        await this.signOut()
        return
      }
    }
    this.publish()
  }

  /**
   * The clock gate: the machine's timezone must belong to the chosen region.
   * Independent of the exit probe — a proxy user's clock stays on home time
   * even when the exit answers elsewhere, and a genuine resident passes by
   * virtue of their OS-configured zone. Unjudgeable combinations (region
   * without zone data, or a platform that cannot name its zone) fail open.
   */
  private timezoneGate(region: string): string | undefined {
    if (region === '') return undefined
    const local = localTimezone()
    const verdict = timezoneMatchesRegion(local, region)
    if (verdict !== false) return undefined
    return `本机时区（${local}）与所选地区「${regionLabel(region)}」不一致，无法登录：请将系统时区改为所选地区，或改选本机实际所在地区。`
  }

  /** The geo gate for both sign-in gestures. `values` carries the dialog
   *  submit's merged card values (the dropdown's live choice rides
   *  `values.region`); the OAuth button has none, so the persisted choice
   *  speaks. Two refusals: the machine's timezone must belong to the chosen
   *  region, and the detected exit must be that same region. A failed exit
   *  probe leaves the exit half of the gate open — there is nothing to
   *  compare against. */
  private gateCheck(values?: Record<string, unknown>): string | undefined {
    const chosen = typeof values?.region === 'string' ? values.region : ''
    const region = chosen !== '' ? chosen : (this.config.region?.get()?.trim() ?? '')
    const clock = this.timezoneGate(region)
    if (clock !== undefined) return clock
    if (this.exitState !== 'ok' || this.exit === undefined) return undefined
    if (region === this.exit.code) return undefined
    return region === ''
      ? `请先在「可用国家与地区」中选择「${this.exit.label}」，再登录。`
      : `所选地区「${regionLabel(region)}」与当前出口地区「${this.exit.label}」不一致，无法登录。`
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

  /** The remote-catalog state: rows in the backend's priority order, and the
   *  one in-flight refresh guard. */
  private chatgptCatalog: readonly ModelRow[] = []
  private catalogRefresh: Promise<void> | undefined

  /** The subscription usage snapshot (the CLI `/status` data). */
  private usage: WhamUsage | undefined
  private usageRefresh: Promise<void> | undefined

  /** Refresh the usage snapshot once; a failure keeps the previous rows. */
  private refreshUsage(): Promise<void> {
    this.usageRefresh ??= this.fetchUsage()
      .catch((error: unknown) => {
        console.info('[codex-account] usage refresh failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => { this.usageRefresh = undefined })
    return this.usageRefresh
  }

  private async fetchUsage(): Promise<void> {
    const oauth = this.oauth ?? await this.readOAuth()
    if (!this.isChatGptMode || oauth === null) return
    const signal = AbortSignal.any([this.requestLifetime.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
    const usage = await readWhamUsage({ token: oauth.accessToken, accountId: oauth.accountId, signal })
    this.usage = usage
    this.publish()
  }

  /** The usage rows for the balance block, rendered from the latest wham
   *  snapshot: both enforced windows plus the purchased credits when the
   *  account carries any. */
  private usageRows(): readonly { label: string; value: string }[] {
    const usage = this.usage
    if (usage === undefined) return []
    const windowLabel = (seconds: number | undefined): string => {
      if (seconds === 604_800) return '每周'
      if (seconds === 86_400) return '每日'
      if (seconds === 18_000) return '5 小时'
      if (seconds !== undefined && seconds > 0) return `${Math.round(seconds / 3600)} 小时`
      return '主窗口'
    }
    const resetLabel = (at: number | undefined): string =>
      at === undefined ? '' : new Date(at * 1000).toLocaleString('zh-CN', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    const rows: { label: string; value: string }[] = []
    for (const window of [usage.primary, usage.secondary]) {
      if (window?.used_percent === undefined) continue
      const reset = resetLabel(window.reset_at)
      rows.push({
        label: `${windowLabel(window.limit_window_seconds)}用量`,
        value: `已用 ${Math.round(window.used_percent)}%${reset === '' ? '' : ` · ${reset} 重置`}`,
      })
    }
    if (usage.creditsBalance !== undefined) {
      rows.push({ label: '已购余额', value: `$${usage.creditsBalance.toFixed(2)}` })
    }
    return rows
  }

  /** Refresh the remote catalog once (the CLI's startup behavior). A failure
   *  keeps whatever catalog is in place — the bundled table still serves. */
  private refreshChatGptCatalog(): Promise<void> {
    this.catalogRefresh ??= this.fetchChatGptCatalog()
      .catch((error: unknown) => {
        console.info('[codex-account] remote catalog refresh failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => { this.catalogRefresh = undefined })
    return this.catalogRefresh
  }

  private async fetchChatGptCatalog(): Promise<void> {
    const oauth = this.oauth ?? await this.readOAuth()
    if (!this.isChatGptMode || oauth === null) return
    const signal = AbortSignal.any([this.requestLifetime.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
    const rows = await readChatGptModels({
      token: oauth.accessToken,
      accountId: oauth.accountId,
      signal,
    })
    this.applyRemoteCatalog(rows)
  }

  /** Install a fetched catalog: map `ModelInfo` rows to the profile's shape,
   *  and when the id set actually moved, rebuild the route profile. */
  private applyRemoteCatalog(rows: readonly RemoteModelInfo[]): void {
    const mapped: ModelRow[] = rows.map(info => ({
      id: info.slug as string,
      ...(info.display_name === undefined ? {} : { name: info.display_name }),
      ...(info.context_window === undefined ? {} : { contextWindow: info.context_window }),
    }))
    if (mapped.length === 0) return
    const unchanged = mapped.length === this.chatgptCatalog.length
      && mapped.every((row, index) => row.id === this.chatgptCatalog[index]?.id)
    if (unchanged) return
    this.chatgptCatalog = mapped
    this.routeProfileKey = ''
    this.publish()
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
    // A fresh login fact (either gesture) retires a startup auto-sign-out's
    // reason — the user is signed in again.
    if (this.signedIn) this.geoNotice = undefined
    this.oauth = await this.readOAuth()
    this.apiKeyStored = await this.readApiKeyGrant()
    // A login arriving through a credential event still seeds the marker
    // before the republish, so the card never blinks out of existence.
    if (this.signedIn) await this.ensureAdoptionMarker()
    void this.refreshChatGptCatalog()
    void this.refreshUsage()
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
    // Startup/config-change sync: a signed-in account restored from storage
    // gets its marker here too (migration for accounts logged in before
    // adoption gating existed).
    if (this.signedIn) await this.ensureAdoptionMarker()
    // The startup sync (the CLI fetches `/models` and `/status` on launch
    // too); both no-op while signed out.
    void this.refreshChatGptCatalog()
    void this.refreshUsage()
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
        // The refresh's fresh id_token carries the current plan claim; pull
        // the usage snapshot too so a plan change on the official site lands
        // here without a restart.
        void this.refreshUsage()
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
      'User-Agent': codexUserAgent(),
      // The CLI stamps this on every Responses call (`responses=experimental`
      // marks the beta surface the subscription backend expects).
      'OpenAI-Beta': 'responses=experimental',
      ...(accountId !== '' ? { 'chatgpt-account-id': accountId } : {}),
    }
  }

  /** Whether the settings user layer carries an explicit `models` write —
   *  an adoption, or a deliberate clearing. schemastery materializes the
   *  mounted volatile array as an empty box even when the user never wrote
   *  the field, so the config box alone cannot distinguish "never adopted"
   *  from "emptied"; the user layer can (a field's presence there marks a
   *  genuine user write). */
  private modelsAdopted(): boolean {
    try {
      const user = this.ctx.settings.describe().find(row => row.ns === this.settingsNs)?.user
      return typeof user === 'object' && user !== null && 'models' in user
    } catch {
      return false
    }
  }

  /**
   * Seed the user layer with an explicit `models: []` once per sign-in, so
   * the models card is visible while the route — under adoption gating —
   * still advertises nothing. Without the marker an untouched catalog would
   * hide the card on both visibility signals (no live group, no user write)
   * and the user could never reach 「获取可用模型」. Idempotent: an existing
   * write (adopted rows or a deliberate clearing) is never overwritten.
   */
  private async ensureAdoptionMarker(): Promise<void> {
    if (!this.signedIn || this.modelsAdopted()) return
    try {
      await this.ctx.settings.mutate(this.settingsNs, [{ op: 'set', path: ['models'], value: [] }])
    } catch (error: unknown) {
      console.info('[codex-account] adoption marker write failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private routeProfiles(): ReadonlyMap<string, ResolvedPiAiProviderProfile> {
    // Adoption gating: the route advertises exactly the catalog saved in
    // 设置-模型 — including `models: []`, advertised as empty so the
    // selectors hide the group — and **nothing** while the catalog was never
    // written. The login flow seeds the user layer with `models: []` (see
    // `ensureAdoptionMarker`), so the models card is visible from sign-in on
    // and the home selector stays empty until the user adopts rows via
    // 「获取可用模型」. The earlier fallback (broadcast the default catalog
    // while untouched) put models on the selector the user never enabled.
    const adopted = this.config.models?.get()
    const signedIn = this.signedIn
    const models = signedIn && this.modelsAdopted() ? adopted ?? [] : []
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
          ? models.map(row => ({
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
      const signal = AbortSignal.any([this.requestLifetime.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      if (this.isChatGptMode) {
        // The official discovery: the subscription backend's `/models` (the
        // same refresh the CLI runs at startup), layered over the bundled
        // catalog exactly like the CLI does — the answer merges both, and a
        // failed refresh falls back to the bundled table alone. Enabling a
        // model stays the user's pick on the models page; the answer also
        // becomes the route's default catalog.
        const oauth = this.oauth ?? await this.readOAuth()
        if (oauth === null) {
          throw new LlmError('ChatGPT 订阅模式尚未登录：请先在账号卡片完成登录。', 'MISSING_CREDENTIAL')
        }
        let rows: readonly RemoteModelInfo[] = BUNDLED_CHATGPT_MODELS
        try {
          const remote = await readChatGptModels({ token: oauth.accessToken, accountId: oauth.accountId, signal })
          rows = mergeWithBundledModels(remote)
        } catch (error: unknown) {
          console.info('[codex-account] remote models refresh failed; serving bundled catalog', {
            error: error instanceof Error ? error.message : String(error),
          })
        }
        this.applyRemoteCatalog(rows)
        return rows.map(info => ({ id: info.slug as string, name: info.display_name ?? info.slug as string }))
      }
      const baseUrl = typeof request.baseURL === 'string' && request.baseURL.trim() !== ''
        ? request.baseURL.trim()
        : this.baseUrlValue
      const ids = await readModels({ baseUrl: baseUrl.replace(/\/+$/, ''), token: key, signal })
      if (ids.length === 0) throw new LlmError('该账号下没有可用模型。', 'CODEX_NO_MODELS')
      // The bundled slugs the key's catalog does not list ride along, so the
      // picker offers the plugin's internal set too.
      const known = new Set(ids)
      return [
        ...ids.map(id => ({ id, name: id })),
        ...BUNDLED_CHATGPT_MODELS
          .filter(info => !known.has(info.slug as string))
          .map(info => ({ id: info.slug as string, name: info.display_name ?? info.slug as string })),
      ]
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
      type: 'chat',
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
        // The geo gate: the OAuth button carries no dialog values, so the
        // persisted region choice is what gets compared.
        const gate = this.gateCheck()
        if (gate !== undefined) return { message: gate, error: true }
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
        // The geo gate: the dialog submit merges the card's live values, so
        // the dropdown's current choice rides `values.region` even when
        // unsaved; a dropdown left untouched falls back to the persisted one.
        const gate = this.gateCheck(values)
        if (gate !== undefined) return { message: gate, error: true }
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
      // A superseded flow's failure is not a failure: the replacement flow
      // owns the card from here on, so its view must not be clobbered.
      if (error instanceof Error && error.message === LOGIN_SUPERSEDED) return
      const message = error instanceof Error ? error.message : String(error)
      this.view = { text: `登录失败：${message}`, level: 'error', signedIn: false, brand: BRAND }
      this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
    })
  }

  private async runOauthLogin(): Promise<void> {
    // Exactly one listener may own 1455: supersede any flow still waiting (a
    // lost browser tab, an aborted card, a user who clicked 登录 twice)
    // instead of letting this attempt die on EADDRINUSE against our own
    // stale server. The superseded flow's rejection is swallowed by its own
    // catch via the sentinel.
    this.oauthLoginFlow?.cancel()
    this.oauthLoginFlow = undefined

    const { verifier, challenge } = generatePkce()
    const state = generatePkce().verifier
    const redirectUri = `http://127.0.0.1:${CALLBACK_PORT}${CALLBACK_PATH}`

    const callback = this.serveCallback(state)
    this.oauthLoginFlow = callback
    // The callback server must not outlive the plugin's lifetime: an abort
    // (dispose/reload) closes the listener and rejects the awaiter, so the
    // port is freed even though nothing else settles the promise.
    const onAbort = (): void => { callback.cancel() }
    if (this.requestLifetime.signal.aborted) onAbort()
    else this.requestLifetime.signal.addEventListener('abort', onAbort, { once: true })
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
      // Seed the marker before the republish: under adoption gating the card
      // rides the user layer, and the selector stays empty until adoption.
      await this.ensureAdoptionMarker()
      void this.refreshChatGptCatalog()
      void this.refreshUsage()
      this.routeProfileKey = ''
      this.publish()
    } finally {
      this.requestLifetime.signal.removeEventListener('abort', onAbort)
      if (this.oauthLoginFlow === callback) this.oauthLoginFlow = undefined
      callback.close()
    }
  }

  /**
   * Serve the one callback catch on `127.0.0.1:1455`. Every exit path —
   * callback served, timeout, superseded by a new flow, lifetime abort,
   * listen error — funnels through one settle-once teardown that stops the
   * listener and drops its connections, so the port is never left bound by
   * a flow that died mid-wait.
   * @param expectedState - the anti-CSRF state this flow sent.
   * @returns the awaited authorization code, a closer, and a canceller that
   *   rejects the awaiter (used when a newer flow takes the port).
   */
  private serveCallback(expectedState: string): { promise: Promise<string>; close(): void; cancel(): void } {
    let server: Server | null = null
    let timer: NodeJS.Timeout | undefined
    let settle: ((error?: Error, code?: string) => void) | undefined
    const promise = new Promise<string>((resolve, reject) => {
      settle = (error, code) => {
        if (settle === undefined) return
        settle = undefined
        if (timer !== undefined) { clearTimeout(timer); timer = undefined }
        // Keep-alive sockets hold a closing server alive past close(); drop
        // them first so the port is released the moment this runs.
        server?.closeAllConnections?.()
        server?.close()
        server = null
        if (error !== undefined) reject(error)
        else resolve(code ?? '')
      }
      timer = setTimeout(() => {
        settle?.(new Error('授权回调等待超时（15 分钟），请重试。'))
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
        if (error !== null) {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          response.end(`<meta charset="utf-8"><title>Codex 登录</title><p>授权被拒绝：${error}，请回到应用重试。</p>`)
          settle?.(new Error(`授权被拒绝：${error}`))
          return
        }
        if (code === null || state !== expectedState) {
          response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          response.end('<meta charset="utf-8"><title>Codex 登录</title><p>回调参数无效。</p>')
          settle?.(new Error('授权回调参数无效（state 不匹配或缺少 code）。'))
          return
        }
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end('<meta charset="utf-8"><title>Codex 登录</title><p>授权成功，请回到 DeepSeek Harness 查看账号状态。</p>')
        settle?.(undefined, code)
      })
      server.once('error', (error: NodeJS.ErrnoException) => {
        settle?.(new Error(error.code === 'EADDRINUSE'
          ? `本地回调端口 ${CALLBACK_PORT} 被占用（可能有另一个登录流程在跑），请稍后重试。`
          : `本地回调服务器启动失败：${error.message}`))
      })
      server.listen(CALLBACK_PORT, '127.0.0.1')
    })
    // The rejection can fire while `runOauthLogin` is still awaiting the
    // browser-open (EADDRINUSE lands on the very first listen tick), so the
    // host's fatal `unhandledRejection` handler would see it before the real
    // `await callback.promise` attaches. Pre-attach a no-op catch to mark the
    // promise handled — the awaited copy still throws into the normal path.
    promise.catch(() => {})
    return {
      promise,
      close: () => { settle?.() },
      cancel: () => { settle?.(new Error(LOGIN_SUPERSEDED)) },
    }
  }

  // ---- published state --------------------------------------------------------

  /** The exit-region suffix for the status line: a startup auto-sign-out's
   *  reason comes first; otherwise the detected facts ride every state and
   *  the probing/failed hints only matter while signed out (on a signed-in
   *  card they'd be noise). */
  private exitSuffix(signedOut: boolean): string {
    if (signedOut && this.geoNotice !== undefined) return ` · ${this.geoNotice}`
    if (this.exitState === 'ok' && this.exit !== undefined) {
      return ` · 出口 ${this.exit.label}（${this.exit.ip}）`
    }
    if (!signedOut) return ''
    return this.exitState === 'pending' ? ' · 正在检测出口地区…' : ' · 出口检测失败（自动重试中）'
  }

  /** Recompute the hub-visible state: the signed-in fact or the signed-out
   *  brand row. */
  private publish(): void {
    if (this.isChatGptMode) {
      const oauth = this.oauth
      if (oauth !== null) {
        const plan = oauth.plan ?? this.usage?.planType
        this.view = {
          text: `已登录 · ChatGPT 订阅${this.exitSuffix(false)}`,
          level: 'ok',
          signedIn: true,
          brand: BRAND,
          identity: {
            // The plan rides on the account name; the mode/endpoint couple is
            // one details line (the hub draws details as the card's second
            // line, above the usage rows).
            name: plan !== undefined
              ? `${oauth.email ?? 'ChatGPT 账号'}（${plan}）`
              : oauth.email !== undefined ? `${oauth.email}` : 'ChatGPT 账号',
            infoLabel: '控制台',
            infoUrl: 'https://chatgpt.com/#settings/Account',
          },
          balance: {
            rows: [...this.usageRows()],
            more: [{ label: '更多', links: [{ label: 'OpenAI Platform', href: CONSOLE_URL, primary: true }] }],
          },
          details: {
            rows: [
              { label: '订阅类型', value: `ChatGPT 订阅 · ${this.baseUrlValue}` },
            ],
          },
        }
      } else {
        this.view = { text: `未登录${this.exitSuffix(true)}`, level: 'warn', signedIn: false, brand: BRAND }
      }
    } else if (this.signedIn) {
      this.view = {
        text: `已登录 · Platform API Key${this.exitSuffix(false)}`,
        level: 'ok',
        signedIn: true,
        brand: BRAND,
        identity: {
          name: 'OpenAI Platform（API Key）',
          infoLabel: '控制台',
          infoUrl: CONSOLE_URL,
        },
        balance: {
          rows: [],
          more: [{ label: '更多', links: [{ label: 'OpenAI Platform', href: CONSOLE_URL, primary: true }] }],
        },
        details: {
          rows: [{ label: '订阅类型', value: `Platform API Key · ${this.baseUrlValue}` }],
        },
      }
    } else {
      this.view = { text: `未登录${this.exitSuffix(true)}`, level: 'warn', signedIn: false, brand: BRAND }
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
      // The adopted catalog is session-scoped: clearing it lets the models
      // page drop the group entirely (the live catalog is empty once the
      // route is signed out, and no managed value remains to keep it up).
      { op: 'unset', path: ['models'] },
    ])
    await this.ctx.credentials.deleteRecord(OAUTH_GRANT)
    await this.ctx.credentials.deleteRecord(APIKEY_GRANT)
    this.oauth = null
    this.apiKeyStored = null
    this.routeProfileKey = ''
    this.publish()
  }
}
