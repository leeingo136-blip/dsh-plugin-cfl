/**
 * Claude account component of `dsh-plugin-claude-ability`.
 *
 * One account product the harness core does not ship: the Claude login and
 * the account-hub registration whose declarative card renders the whole
 * settings row. Both auth modes mirror `claude login` (the official CLI's
 * community-documented flow):
 *
 * - **Claude subscription (Pro/Max)**: OAuth authorization-code + PKCE in
 *   paste mode. The card's sign-in gesture builds the authorize URL and
 *   opens the browser; Anthropic's hosted callback page displays the grant
 *   as `code#state`, which the user pastes back into the card's dialog.
 *   The exchanged token set (access / refresh) is stored in the credentials
 *   store and the access token is refreshed lazily on the request path. The
 *   `sk-ant-oat01-` token rides pi-ai's OAuth handling (Bearer + Claude Code
 *   identity headers) and the route stamps the OAuth beta header.
 * - **Anthropic Console API key**: pasted against the Messages API endpoint,
 *   with the paste field mirrored into the credentials store exactly like
 *   the Qwen account's.
 *
 * There is deliberately no account/password login: the plugin never handles
 * the user's Claude credentials — the browser session on Anthropic's own
 * pages is the only place a password ever belongs.
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

import { readFileSync } from 'node:fs'
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
import { LOCAL_VERSION, driftMessage, fetchUpstreamVersion, normalizeVersion } from './version-gate.ts'
import { emptyCredentialStore, resolveAnthropicMessagesProfile, staticAuthContext } from './pi-ai-bridge.ts'
import {
  API_BASE_URL, BUNDLED_CLAUDE_MODELS, CONSOLE_URL, OAUTH_BETA,
  buildAuthorizeUrl, claudeUserAgent, exchangeCode, generatePkce, parsePastedGrant,
  readConsoleModels, refreshTokens,
} from './protocol.ts'

/** Stable identity: hub account id and entry id fallback. */
export const name = 'claude-account-external'
const ID = name

const REQUEST_TIMEOUT_MS = 30_000
/** The exit-probe retry cadence while every probe service stays unreachable
 *  (boot with the proxy not yet up, rate-limited shared exits, …). */
const EXIT_RETRY_MS = 15_000
/** The paste-mode grant's validity window: the authorization code the
 *  callback page displays expires minutes after issue, so a pending flow
 *  older than this is refused at paste time. */
const LOGIN_TIMEOUT_MS = 15 * 60_000
/** Refresh the access token when it expires within this horizon. */
const REFRESH_SKEW_MS = 5 * 60_000

/** The pi-ai route this account mounts. */
const ROUTE = 'Claude-account'
/** The credential reference name the profile renders. */
const DEFAULT_CREDENTIAL_REF_NAME = 'CLAUDE_CREDENTIAL'

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
  mode: zschema.union(['Claude 订阅（OAuth）', 'API Key（Anthropic Console）']).volatile(),
  apiKey: zschema.string().volatile(),
  customBaseUrl: zschema.string().volatile(),
  models: zschema.array(modelRow).volatile(),
  // A free string (region codes are too many for a union); the geo gate
  // validates the choice against the detected exit at sign-in and startup.
  region: zschema.string().volatile(),
}) as unknown as SchemaNode

/** The brand line both card states draw. */
/** The Anthropic mark (the starburst logomark on the brand's warm ivory
 *  disc), bundled as a data URI. */
const LOGO_DATA_URI: string | undefined = (() => {
  try {
    const svg = readFileSync(new URL('../assets/claude-logo.svg', import.meta.url), 'utf8')
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
  } catch {
    return undefined
  }
})()

const BRAND = Object.freeze({ logoUrl: LOGO_DATA_URI, name: 'Claude 账号' })

/** The credential record keys. */
const OAUTH_GRANT = credentialKey(ID, 'grant-oauth')
const APIKEY_GRANT = credentialKey(ID, 'grant-key')

/** The two auth modes, keyed by their config labels. */
const MODE_SUBSCRIPTION = 'Claude 订阅（OAuth）'
const MODE_APIKEY = 'API Key（Anthropic Console）'

/** The stored OAuth token set. */
interface StoredOAuth {
  readonly version: 1
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: number
}

/** The stored Console key mirror. */
interface StoredApiKey {
  readonly version: 1
  readonly apiKey: string
}

/** One pending paste-mode login: the PKCE facts awaiting the pasted grant. */
interface PendingLogin {
  readonly verifier: string
  readonly startedAt: number
}

/**
 * The account service. Hosting services (llm, accountHub, settings,
 * credentials) arrive through injection; the plugin registers its route and
 * hub card in its constructor, and re-ingests whenever the configuration or
 * a credential record moves.
 */
export default class ClaudeAccountExternal extends Service {
  static inject = ['llm', 'accountHub', 'settings', 'credentials']
  static Config = Config

  private readonly settingsNs: string
  private readonly config: Config
  private readonly requestLifetime = new AbortController()

  /** The pending paste-mode login, if any. A new sign-in supersedes it —
   *  only one PKCE verifier can be outstanding at a time. */
  private pendingLogin: PendingLogin | undefined

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

  // ---- upstream port-provenance gate --------------------------------------------

  /** The fetched drift verdict ('unknown' while the boot check is in flight;
 *  a failed fetch fails open — the state then never leaves 'match'). */
  private gateState: 'unknown' | 'match' | 'mismatch' = 'unknown'
  private gateUpstream: string | undefined
  private gateFetch: Promise<'match' | 'mismatch'> | undefined
  /** Why the startup provenance gate auto-signed-out, shown on the signed-out
   *  card (the geoNotice pattern). */
  private versionNotice: string | undefined

  /** Fetch and compare the upstream version once per boot. Memoized; a failed
   *  fetch fails open (offline must keep working) and is logged, not shown. */
  private upstreamVerdict(): Promise<'match' | 'mismatch'> {
    this.gateFetch ??= fetchUpstreamVersion()
      .then((upstream): 'match' | 'mismatch' => {
        this.gateUpstream = upstream
        this.gateState = normalizeVersion(upstream) === normalizeVersion(LOCAL_VERSION) ? 'match' : 'mismatch'
        return this.gateState
      })
      .catch((error: unknown) => {
        console.info('[claude-account] upstream version check failed; gate open', {
          error: error instanceof Error ? error.message : String(error),
        })
        return 'match' as const
      })
    return this.gateFetch
  }

  /** The sign-in refusal while upstream has drifted, or undefined. */
  private async versionGateRefusal(): Promise<string | undefined> {
    const verdict = await this.upstreamVerdict()
    if (verdict !== 'mismatch' || this.gateUpstream === undefined) return undefined
    return `无法登录：${driftMessage(LOCAL_VERSION, this.gateUpstream)}`
  }

  /** The boot-time enforcement: drop an existing login when the upstream has
   *  drifted past the version this port was made from, and surface the reason
   *  on the signed-out card. A signed-out install only learns the reason. */
  private async enforceUpstreamVersion(): Promise<void> {
    try {
      const verdict = await this.upstreamVerdict()
      if (verdict !== 'mismatch' || this.gateUpstream === undefined) return
      const notice = driftMessage(LOCAL_VERSION, this.gateUpstream)
      if (this.signedIn) {
        // The notice must exist before signOut publishes the signed-out view.
        this.versionNotice = `已自动退出：${notice}`
        await this.signOut()
        this.publish()
      } else {
        this.versionNotice = notice
        this.publish()
      }
    } catch (error: unknown) {
      console.info('[claude-account] upstream gate enforcement failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** @param ctx - host context. @param config - plugin configuration. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'claudeAccount')
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

    ctx.effect(() => () => { this.requestLifetime.abort() }, 'claude-account-external: request lifetime')
    ctx.effect(() => () => {
      if (this.exitRetry !== undefined) clearTimeout(this.exitRetry)
    }, 'claude-account-external: exit retry timer')

    this.registerProvider(ctx)
    this.registerHub(ctx)
    void this.ingest()
    // The exit probe rides the plugin load, not a readiness gate: a slow or
    // dead probe service must not delay the plugin's readiness.
    void this.detectExit()
    // The provenance gate rides the same posture: an async boot check that
    // refuses sign-in and drops a stale login when the upstream has moved.
    void this.enforceUpstreamVersion()
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

  /** The geo gate for all three sign-in gestures. `values` carries the
   *  dialog submit's merged card values (the dropdown's live choice rides
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
    return mode === MODE_APIKEY ? MODE_APIKEY : MODE_SUBSCRIPTION
  }

  get isSubscriptionMode(): boolean {
    return this.modeValue === MODE_SUBSCRIPTION
  }

  /** The pasted Console API key, or '' when the field is empty. */
  get apiKeyValue(): string {
    return this.config.apiKey?.get()?.trim() ?? ''
  }

  /** Whether a login fact exists for the selected mode. */
  get signedIn(): boolean {
    return this.isSubscriptionMode ? this.oauth !== null : (this.apiKeyValue !== '' || this.apiKeyStored !== null)
  }

  /** The endpoint the selected mode serves. A non-empty custom base URL wins
   *  over the mode default (the escape hatch for gateways and proxies). */
  get baseUrlValue(): string {
    const custom = this.config.customBaseUrl?.get()?.trim() ?? ''
    if (custom !== '') return custom.replace(/\/+$/, '')
    return API_BASE_URL
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
    this.routeProfileKey = ''
    this.publish()
  }

  /** Sync the pasted Console key into its mirror (config-driven; the OAuth
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
    this.routeProfileKey = ''
    this.publish()
  }

  // ---- credential resolution ----------------------------------------------------

  /**
   * The credential a request should present, resolved per the selected mode.
   * Subscription mode refreshes the access token lazily (one in-flight
   * refresh at a time; permanent refresh failures surface as a login error).
   */
  private async resolveKey(): Promise<string> {
    if (!this.isSubscriptionMode) {
      const stored = this.apiKeyStored?.apiKey ?? (await this.readApiKeyGrant())?.apiKey
      if (stored !== undefined && stored !== '') return stored
      const pasted = this.apiKeyValue
      if (pasted !== '') return pasted
      throw new LlmError('Claude 账号还没有 API Key：请在 Anthropic Console 创建后粘贴到本组件配置中。', 'MISSING_CREDENTIAL')
    }
    const oauth = this.oauth ?? await this.readOAuth()
    if (oauth === null) {
      throw new LlmError('Claude 账号还没有登录：点账号卡片上的「登录 Claude 账号」完成授权。', 'MISSING_CREDENTIAL')
    }
    if (oauth.expiresAt - REFRESH_SKEW_MS > Date.now()) return oauth.accessToken
    if (oauth.refreshToken === '') {
      throw new LlmError('Claude 登录凭证已过期且没有可用的刷新令牌：请重新登录。', 'CREDENTIAL_EXPIRED')
    }
    if (this.refreshInFlight !== null) return this.refreshInFlight
    this.refreshInFlight = refreshTokens({ refreshToken: oauth.refreshToken, signal: this.requestLifetime.signal })
      .then(async (tokens) => {
        const next: StoredOAuth = {
          version: 1,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token !== '' ? tokens.refresh_token : oauth.refreshToken,
          expiresAt: Date.now() + tokens.expires_in * 1000,
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

  /** The attribution headers the wire requires for the selected mode. The
   *  subscription surface requires the OAuth beta header; pi-ai's OAuth
   *  client path supplies the Claude Code identity headers itself. */
  private routeHeaders(): Readonly<Record<string, string>> {
    if (!this.isSubscriptionMode) return {}
    return { 'anthropic-beta': OAUTH_BETA }
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
   *
   * Early-boot care: while the settings projection has not merged the user
   * patch layer yet, `describe()` finds no row for this namespace at all and
   * `modelsAdopted()` reports false. Writing then would clobber an adopted
   * catalog persisted by a previous session with an empty array. A missing
   * row means "projection not ready" — skip; the next sign-in state change
   * or config update retries.
   */
  private async ensureAdoptionMarker(): Promise<void> {
    if (!this.signedIn || this.modelsAdopted()) return
    try {
      const row = this.ctx.settings.describe().find(row => row.ns === this.settingsNs)
      if (row === undefined) return
      await this.ctx.settings.mutate(this.settingsNs, [{ op: 'set', path: ['models'], value: [] }])
    } catch (error: unknown) {
      console.info('[claude-account] adoption marker write failed', {
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
      next.set(ROUTE, resolveAnthropicMessagesProfile({
        provider: ROUTE,
        displayName: 'Claude 账号',
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
        displayName: 'Claude 账号',
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
    ctx.llm.registerModelDiscovery(this.settingsNs, async (_request): Promise<readonly LlmDiscoveredModel[]> => {
      const key = await this.resolveKey()
      const signal = AbortSignal.any([this.requestLifetime.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      if (this.isSubscriptionMode) {
        // The subscription backend serves no portable model-list endpoint —
        // the bundled catalog is the answer (the official CLI's own trade:
        // its bundled models.json is the offline layer).
        if (this.oauth === null) {
          throw new LlmError('Claude 订阅模式尚未登录：请先在账号卡片完成登录。', 'MISSING_CREDENTIAL')
        }
        return BUNDLED_CLAUDE_MODELS.map(info => ({ id: info.id, name: info.name }))
      }
      const baseUrl = this.baseUrlValue
      const ids = await readConsoleModels({ baseUrl, apiKey: key, signal })
      if (ids.length === 0) throw new LlmError('该账号下没有可用模型。', 'CLAUDE_NO_MODELS')
      // The bundled ids the key's catalog does not list ride along, so the
      // picker offers the plugin's internal set too.
      const known = new Set(ids)
      return [
        ...ids.map(id => ({ id, name: id })),
        ...BUNDLED_CLAUDE_MODELS
          .filter(info => !known.has(info.id))
          .map(info => ({ id: info.id, name: info.name })),
      ]
    })
  }

  // ---- hub registration -------------------------------------------------------

  private registerHub(ctx: Context): void {
    const dispose = ctx.accountHub.register({
      id: ID,
      displayName: 'Claude 账号',
      settingsNs: this.settingsNs,
      provider: ROUTE,
      modelsCard: true,
      type: 'chat',
      workMode: 'credential-inject',
      card: CARD,
      invoke: (method: string, args: JsonValue) => this.invoke(method, args),
      getState: () => this.view as unknown as JsonValue,
    })
    ctx.effect(() => dispose, 'claude-account-external: hub registration')
  }

  /** Forward one hub-card operation to its implementation. Dialog submits
   *  arrive as `{ values: { …card values, …dialog inputs } }`. */
  private async invoke(method: string, args?: JsonValue): Promise<JsonValue> {
    switch (method) {
      case 'sign-in': {
        // The provenance gate: an upstream drift refuses every new login.
        const drift = await this.versionGateRefusal()
        if (drift !== undefined) return { message: drift, error: true }
        // The geo gate: the OAuth button carries no dialog values, so the
        // persisted region choice is what gets compared.
        const gate = this.gateCheck()
        if (gate !== undefined) return { message: gate, error: true }
        return await this.startOauthLogin()
      }
      case 'complete-sign-in': {
        const values = (args !== null && typeof args === 'object' && 'values' in args
          ? (args as { values: Record<string, unknown> }).values
          : {}) ?? {}
        const pasted = typeof values.code === 'string' ? values.code.trim() : ''
        if (pasted === '') {
          return { message: '请先粘贴授权码（code#state 或完整回调 URL）。', error: true }
        }
        // The provenance gate: an upstream drift refuses every new login.
        const drift = await this.versionGateRefusal()
        if (drift !== undefined) return { message: drift, error: true }
        // The geo gate: the dialog submit merges the card's live values, so
        // the dropdown's current choice rides `values.region` even when
        // unsaved; a dropdown left untouched falls back to the persisted one.
        const gate = this.gateCheck(values)
        if (gate !== undefined) return { message: gate, error: true }
        return await this.completeOauthLogin(pasted)
      }
      case 'paste-key': {
        const values = (args !== null && typeof args === 'object' && 'values' in args
          ? (args as { values: Record<string, unknown> }).values
          : {}) ?? {}
        const pasted = typeof values.apiKey === 'string' ? values.apiKey.trim() : ''
        if (pasted === '') {
          return { message: '请先粘贴 Anthropic Console API Key。', error: true }
        }
        // The provenance gate: an upstream drift refuses every new login.
        const drift = await this.versionGateRefusal()
        if (drift !== undefined) return { message: drift, error: true }
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

  // ---- OAuth login flow (paste mode) --------------------------------------------

  /**
   * Kick off one paste-mode OAuth login: build the authorize URL and open
   * the browser. The grant comes back through the 「粘贴授权码登录」 dialog
   * — there is no local callback server to serve.
   */
  private async startOauthLogin(): Promise<JsonValue> {
    const pkce = generatePkce()
    this.pendingLogin = { verifier: pkce.verifier, startedAt: Date.now() }
    let authorizeUrl = buildAuthorizeUrl(pkce)
    try {
      await openNativePath(authorizeUrl, this.requestLifetime.signal)
    } catch (error) {
      console.info('[claude-account] browser open failed', {
        error: error instanceof Error ? error.message : String(error),
        authorizeUrl,
      })
    }
    this.view = {
      text: '等待授权：在浏览器完成登录后，复制授权码并点「粘贴授权码登录」提交…',
      level: 'warn',
      signedIn: false,
      brand: BRAND,
    }
    this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
    return { message: '已打开 Claude 授权页：登录并授权后，复制页面显示的授权码（code#state 或整个回调地址），点「粘贴授权码登录」提交。' }
  }

  /** Complete one paste-mode login: parse the pasted grant, verify the
   *  state, exchange the code, and store the token set. */
  private async completeOauthLogin(pasted: string): Promise<JsonValue> {
    const pending = this.pendingLogin
    if (pending === undefined) {
      return { message: '没有进行中的登录流程：请先点「登录 Claude 账号」打开授权页。', error: true }
    }
    if (Date.now() - pending.startedAt > LOGIN_TIMEOUT_MS) {
      this.pendingLogin = undefined
      return { message: '登录流程已超时（15 分钟）：请重新点「登录 Claude 账号」再试。', error: true }
    }
    let code: string
    let state: string | undefined
    try {
      const grant = parsePastedGrant(pasted)
      code = grant.code
      state = grant.state
    } catch (error) {
      return { message: error instanceof Error ? error.message : String(error), error: true }
    }
    // Anti-CSRF: the flow's state equals its PKCE verifier. A pasted state
    // must match; a bare code is accepted against the pending flow's own
    // state (the official CLI does the same).
    if (state !== undefined && state !== pending.verifier) {
      this.pendingLogin = undefined
      return { message: 'state 校验失败：粘贴的授权码与本次登录流程不匹配，请重新登录。', error: true }
    }
    let tokens
    try {
      tokens = await exchangeCode({
        code, ...(state !== undefined ? { state } : {}), verifier: pending.verifier, signal: this.requestLifetime.signal,
      })
    } catch (error) {
      // The pending flow survives an exchange failure: the code may have
      // been mistyped, and a retry against the same verifier stays valid.
      const message = error instanceof Error ? error.message : String(error)
      return { message: `登录失败：${message}（请检查授权码是否完整，或重新登录。）`, error: true }
    }
    this.pendingLogin = undefined
    const stored: StoredOAuth = {
      version: 1,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    }
    await this.ctx.credentials.modifyRecord(OAUTH_GRANT, () => Promise.resolve({ kind: 'grant' as const, payload: stored }))
    this.oauth = stored
    // Seed the marker before the republish: under adoption gating the card
    // rides the user layer, and the selector stays empty until adoption.
    await this.ensureAdoptionMarker()
    this.routeProfileKey = ''
    this.publish()
    return { message: '登录成功：Claude 订阅凭据已保存，认证方式已切换为订阅 OAuth。', close: true }
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

  /** The signed-out status line suffix: the provenance-gate reason wins over
   *  the exit-probe facts — it is the actionable one. */
  private signedOutSuffix(): string {
    if (this.versionNotice !== undefined) return ` · ${this.versionNotice}`
    return this.exitSuffix(true)
  }

  /** Recompute the hub-visible state: the signed-in fact or the signed-out
   *  brand row. */
  private publish(): void {
    if (this.isSubscriptionMode) {
      const oauth = this.oauth
      if (oauth !== null) {
        this.view = {
          text: `已登录 · Claude 订阅${this.exitSuffix(false)}`,
          level: 'ok',
          signedIn: true,
          brand: BRAND,
          identity: {
            name: 'Claude 订阅（Pro/Max）',
            infoLabel: '控制台',
            infoUrl: 'https://claude.ai/settings',
          },
          balance: {
            rows: [],
            more: [{ label: '更多', links: [{ label: 'Anthropic Console', href: CONSOLE_URL, primary: true }] }],
          },
          details: {
            rows: [
              { label: '订阅类型', value: `Claude 订阅 · ${this.baseUrlValue}` },
            ],
          },
        }
      } else {
        this.view = { text: `未登录${this.signedOutSuffix()}`, level: 'warn', signedIn: false, brand: BRAND }
      }
    } else if (this.signedIn) {
      this.view = {
        text: `已登录 · Console API Key${this.exitSuffix(false)}`,
        level: 'ok',
        signedIn: true,
        brand: BRAND,
        identity: {
          name: 'Anthropic Console（API Key）',
          infoLabel: '控制台',
          infoUrl: CONSOLE_URL,
        },
        balance: {
          rows: [],
          more: [{ label: '更多', links: [{ label: 'Anthropic Console', href: CONSOLE_URL, primary: true }] }],
        },
        details: {
          rows: [{ label: '订阅类型', value: `Console API Key · ${this.baseUrlValue}` }],
        },
      }
    } else {
      this.view = { text: `未登录${this.exitSuffix(true)}`, level: 'warn', signedIn: false, brand: BRAND }
    }
    this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
  }

  // ---- sign-in / sign-out -------------------------------------------------------

  /** The Console-key sign-in gesture: store the pasted key and flip the
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

  /** Clear every login fact: both credential records and the paste field.
   *  The pending paste-mode login (if any) is dropped with them. */
  private async signOut(): Promise<void> {
    this.pendingLogin = undefined
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

/** Re-export for parity with the other account components' surfaces. */
export { claudeUserAgent }
