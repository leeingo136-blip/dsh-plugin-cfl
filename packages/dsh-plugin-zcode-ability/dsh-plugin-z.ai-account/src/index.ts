/**
 * Z.ai / GLM account component of `dsh-plugin-zcode-ability`.
 *
 * One account product the harness core does not ship: a Z.ai/BigModel browser
 * sign-in, the inference API key the account mints for itself through the
 * platform's business console, and the account-hub registration whose
 * declarative card renders the whole settings row.
 *
 * Work mode is credential-inject: the account mounts its own models-page
 * route on the harness's pi-ai adapter family — the adapter, the Anthropic
 * wire, and the model discovery machinery are the harness's; the plugin only
 * supplies the parameters. The provisioned key is injected under the
 * credential reference the route reads (`apiKeyEnv`), so the key never
 * crosses a settings surface, and the profile itself — display name,
 * endpoint per sign-in platform, adopted catalog — is constructed locally
 * against pi-ai's public types (see `./pi-ai-bridge.ts`). A pasted API key
 * needs no plugin at all: the account provisions its own key at sign-in and
 * injects it under the credential reference the route reads.
 *
 * One component among this plugin's, mounted by the deployment patch row
 * whose `name:` is `<package>/account-zai` — deliberately outside any agent
 * preset: an account is something the user installs, not something a
 * conversation switches on.
 */

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { credentialKey, credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import { LlmError, resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type {} from '@dsh/api-account-hub'
import { ACCOUNT_HUB_CHANGED } from '@dsh/api-account-hub'
import type { AccountHubCardState } from '@dsh/api-account-hub'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { openNativePath } from '@deepseek-ai/dsh-native-command'
import { z } from 'zod'
import zschema from '@deepseek-ai/schemastery'
import { CARD } from './card.ts'
import { emptyCredentialStore, resolveAnthropicProfile, staticAuthContext } from './pi-ai-bridge.ts'
import { LOCAL_VERSION, driftMessage, fetchUpstreamVersion, normalizeVersion } from './version-gate.ts'
import {
  BIGMODEL_BIZ_ORIGIN, DEFAULT_BASE_URL, DEFAULT_BIGMODEL_BASE_URL, DEFAULT_BIGMODEL_ORIGIN,
  BIGMODEL_MONEY_ORIGIN, DEFAULT_ZAI_ORIGIN, DEFAULT_ZCODE_ORIGIN, ZAI_BIZ_ORIGIN,
  desktopHandoffRedirect, exchangeZaiBusinessToken, handoffParam, pollCliFlow, profileOf, readModels, readMoneyBalance, readZaiBalance,
  resolveBizApiKey, startCliFlow,
  type AccountProfile, type CliFlow, type OAuthProvider, type StoredGrant,
} from './protocol.ts'

/** Stable identity: hub account id and entry id fallback. */
export const name = 'zai-account-external'
const ID = name

/** The storage model mirrors ZCode's shared credential store: one grant and
 *  one captured identity per platform (`grant-<provider>` / `user-<provider>`)
 *  plus an `active` selector naming the login the account serves. A re-login
 *  on the other platform overwrites only its own group, so the identity shown
 *  after a restart always belongs to the active login — never a stale first
 *  sign-in's (ZCode: `oauth:<provider>:{access_token,refresh_token,user_info}`
 *  + `oauth:active_provider`). */
const ACTIVE = credentialKey(ID, 'active')
const ACTIVE_PROVIDER = z.enum(['zai', 'bigmodel'])
const grantKeyOf = (provider: OAuthProvider) => credentialKey(ID, `grant-${provider}`)
const userKeyOf = (provider: OAuthProvider) => credentialKey(ID, `user-${provider}`)
/** Pre-alignment records, lifted once on boot. */
const LEGACY_KEY = credentialKey(ID, 'default')
const LEGACY_DEVICE = credentialKey(ID, 'device')

/** The pi-ai route this account mounts: the adapter serves it, the hub
 *  registration's provider names it (so the card seat finds its row), and
 *  the credential reference default follows the Models page's own derivation
 *  convention (`deriveKeyRef` on the route id)… up to the suffix the route
 *  carries, so the profile names it explicitly instead. */
const ROUTE = 'Z.ai-account'
const DEFAULT_CREDENTIAL_REF_NAME = 'GLM_API_KEY'

/** The Anthropic-protocol gateway root per platform: the account's
 *  inference endpoint facts, stated once. The route this account writes
 *  speaks `anthropic-messages` — the harness's native pi-ai Anthropic wire —
 *  against the platform gateway that serves the Anthropic protocol to
 *  standard API keys. */
const ANTHROPIC_BASE_BY_PROVIDER = {
  zai: 'https://api.z.ai/api/anthropic',
  bigmodel: 'https://open.bigmodel.cn/api/anthropic',
} as const satisfies Record<OAuthProvider, string>

/** One adopted catalog row, mirroring the official model-list editor: the
 *  fields the models page writes at this namespace's `models` key. */
export interface ModelRow {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  input?: string[]
}

const MODEL_MODALITIES = ['text'] as const

const modelRow = zschema.object({
  id: zschema.string().required(),
  name: zschema.string(),
  contextWindow: zschema.number().step(1).min(1),
  maxTokens: zschema.number().step(1).min(1),
  input: zschema.array(zschema.union([...MODEL_MODALITIES])),
})

/** The stored login fact. */
const grant = z.object({
  version: z.literal(1),
  kind: z.enum(['oauth', 'apikey']),
  provider: z.enum(['zai', 'bigmodel']).optional(),
  token: z.string().min(1),
  issuer: z.string().min(1),
  expiresAt: z.number().optional(),
  refreshToken: z.string().optional(),
  zcodeJwt: z.string().optional(),
  apiKey: z.string().optional(),
})
/** The identity captured by the most recent login **on that platform**: the
 *  exchange response is the one reliable identity source, so it is persisted
 *  beside the device id — one record per provider, like ZCode's user_info. */
const device = z.object({ id: z.string().min(1), user: z.unknown().optional() })

const ATTEMPT_TIMEOUT_MS = 600_000
const REQUEST_TIMEOUT_MS = 30_000

/** Minimum spacing between on-view balance reads. The official account
 *  mechanism has no timer — it reads when a viewer looks — so this only keeps
 *  the publish → re-pull → getState cycle from re-triggering the read. */
const VIEW_REFRESH_THROTTLE_MS = 30_000

/** A volatile Config field arrives from schemastery as a frozen lazy box. */
export interface VolatileBox<T> {
  readonly get: () => T
}

/** Structural mirror of the hub's balance row — the API package keeps that
 *  interface internal, so the plugin declares the same shape locally. */
interface BalanceRow {
  label: string
  value?: string
  loading?: boolean
  unavailable?: { label: string; href: string }
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
  zaiOrigin?: VolatileBox<string>
  zcodeOrigin?: VolatileBox<string>
  models?: VolatileBox<ModelRow[]>
}

/** The schema class instance type, nameable without dragging cosmokit into
 *  the declaration surface (any raw `object()` inference is not — its type
 *  intersects cosmokit's `Dict`). */
type SchemaNode = InstanceType<typeof zschema>

/** The configuration schema. The value is the plain schemastery object; the
 *  assertion only keeps the emitted declaration portable. */
export const Config = zschema.object({
  apiKeyEnv: zschema.string().volatile(),
  zaiOrigin: zschema.string().volatile(),
  zcodeOrigin: zschema.string().volatile(),
  models: zschema.array(modelRow).volatile(),
}) as unknown as SchemaNode

/** The bundled mark, inlined as a data URI so the hub can draw it without any
 *  plugin-served route. */
const LOGO_DATA_URI: string | undefined = (() => {
  try {
    const svg = readFileSync(new URL('../assets/glm-logo.svg', import.meta.url), 'utf8')
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
  } catch { return undefined }
})()

/** The brand line both card states draw; the hub falls back to a generic card
 *  when an attempt view carries none. */
const BRAND = Object.freeze({ logoUrl: LOGO_DATA_URI, name: 'Z.ai 账号' })

/** One browser sign-in attempt's observable phase. */
type Phase = 'initializing' | 'waiting-browser' | 'exchanging' | 'committing'

const PHASE_TEXT: { [P in Phase]: string } = {
  initializing: '登录中：初始化…',
  'waiting-browser': '登录中：等待浏览器授权…',
  exchanging: '登录中：等待授权确认…',
  committing: '登录中：写入凭据…',
}

/**
 * The account service. Hosting services (llm, credentials, accountHub) arrive
 * through injection; the plugin registers its route and hub card in its
 * constructor and re-ingests the stored sign-in on init.
 */
export default class ZaiAccountExternal extends Service {
  static inject = ['llm', 'credentials', 'accountHub', 'settings']
  static Config = Config

  private readonly settingsNs: string
  private readonly config: Config
  private readonly requestLifetime = new AbortController()

  private signedIn = false
  private providerCache: OAuthProvider = 'zai'
  private profileCache: AccountProfile | undefined
  /** The Z.ai plan-balance rows behind the signed-in card; `undefined` means
   *  the row degrades to the console link. */
  private balanceCache: readonly BalanceRow[] | undefined
  /** On-view refresh throttle and in-flight guard (see refreshBalanceOnView). */
  private lastBalanceRequest = 0
  private balanceRead: Promise<void> | undefined
  private attemptText: string | undefined
  private removing: Promise<void> | undefined
  private view: AccountHubCardState = { text: '未登录', level: 'warn', signedIn: false, brand: BRAND }

  // ---- upstream port-provenance gate --------------------------------------------

  /** The fetched drift verdict ('unknown' while the boot check is in flight;
 *  a failed fetch fails open — the state then never leaves 'match'). */
  private gateState: 'unknown' | 'match' | 'mismatch' = 'unknown'
  private gateUpstream: string | undefined
  private gateCheck: Promise<'match' | 'mismatch'> | undefined
  /** The upstream drift notice shown on the signed-out card. */
  private versionNotice: string | undefined

  /** Fetch and compare the upstream version once per boot. Memoized; a failed
   *  fetch fails open (offline must keep working) and is logged, not shown. */
  private upstreamVerdict(): Promise<'match' | 'mismatch'> {
    this.gateCheck ??= fetchUpstreamVersion()
      .then((upstream): 'match' | 'mismatch' => {
        this.gateUpstream = upstream
        this.gateState = normalizeVersion(upstream) === normalizeVersion(LOCAL_VERSION) ? 'match' : 'mismatch'
        return this.gateState
      })
      .catch((error: unknown) => {
        console.info('[zai-account] upstream version check failed; gate open', {
          error: error instanceof Error ? error.message : String(error),
        })
        return 'match' as const
      })
    return this.gateCheck
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
        // The notice must exist before signOut's credential events publish
        // the signed-out view.
        this.versionNotice = `已自动退出：${notice}`
        await this.signOut()
        this.publish()
      } else {
        this.versionNotice = notice
        this.publish()
      }
    } catch (error: unknown) {
      console.info('[zai-account] upstream gate enforcement failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** @param ctx - host context. @param config - plugin configuration. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'zaiAccount')
    this.settingsNs = ctx.fiber?.entry?.options.id ?? ID
    this.config = config

    ctx.on('credentials/record-updated', (key: CredentialKey) => {
      const watched: readonly CredentialKey[] = [ACTIVE, grantKeyOf('zai'), grantKeyOf('bigmodel'), userKeyOf('zai'), userKeyOf('bigmodel')]
      if (!watched.includes(key)) return
      void this.ingestStoredState()
    })

    ctx.effect(() => () => { this.requestLifetime.abort() }, 'zai-account-external: request lifetime')

    this.registerProvider(ctx)
    this.registerHub(ctx)
    this.publish()
    // The provenance gate rides the plugin load, not a readiness gate: a
    // slow or dead check must not delay the plugin's readiness.
    void this.enforceUpstreamVersion()
  }

  async [Service.init](): Promise<void> {
    await this.cleanupLegacyRoute()
    await this.ingestStoredState()
  }

  /** Drop the route profile an earlier architecture of this plugin wrote into
   *  the `llm-pi-ai` namespace: the route is now declared by this plugin's
   *  own directory entry, and a stored `llm-pi-ai` profile naming the same
   *  route would make the harness's pi-ai plugin declare it too — a
   *  duplicate-directory conflict that would refuse the registration. The
   *  write is idempotent and fails soft; the next boot retries. */
  private async cleanupLegacyRoute(): Promise<void> {
    try {
      const descriptor = this.ctx.settings.describe({ redactSecrets: true })
        .find(row => row.ns === 'llm-pi-ai')
      const section = (descriptor?.value ?? {}) as { providers?: Record<string, unknown> }
      if (section.providers?.[ROUTE] === undefined) return
      await this.ctx.settings.mutate('llm-pi-ai', [{ op: 'unset', path: ['providers', ROUTE] }])
    } catch { /* A stale route is retried on the next boot. */ }
  }

  // ---- configuration reads --------------------------------------------------

  /** The credential reference name the injected key lands under: the
   *  configured override wins, else the conventional name for this route. */
  get credentialRefName(): string {
    const configured = this.config.apiKeyEnv?.get()?.trim()
    return configured === undefined || configured === '' ? DEFAULT_CREDENTIAL_REF_NAME : configured
  }

  /** The Z.ai console origin backing the outward links. */
  get zaiOrigin(): string {
    const configured = this.config.zaiOrigin?.get()?.trim()
    return configured === undefined || configured === '' ? DEFAULT_ZAI_ORIGIN : configured.replace(/\/+$/, '')
  }

  // ---- route registration ----------------------------------------------------

  /** The model catalog the user adopted, if any. */
  get adoptedModelsValue(): readonly ModelRow[] {
    return this.config.models?.get() ?? []
  }

  /** The current pi-ai profile for the account's route, built over pi-ai's
   *  public types by the local bridge. Memoized by the facts that shape it:
   *  the profile only moves when the sign-in state, the platform, the
   *  reference name, or the adopted catalog changes — the adapter recognizes
   *  an unchanged map by identity and keeps its collection. While signed out
   *  the route stays **owned but empty**: a missing profile would make
   *  `listModels` throw NO_ADAPTER, which the desktop model selector renders
   *  as a「加载失败」warning bar; an owned profile with no models lists zero
   *  models, so both the selector and the models page simply hide the row
   *  (each derives visibility from a non-empty catalog group). */
  private routeProfiles(): ReadonlyMap<string, ResolvedPiAiProviderProfile> {
    // The picker shows exactly what the models page's editor has saved —
    // no default fallback. An untouched catalog serves nothing: a picker
    // entry appears only after a model is configured (visibility is
    // configuration-gated, matching the embedding account's posture).
    const models = this.signedIn ? this.config.models?.get() ?? [] : []
    const key = JSON.stringify([this.signedIn, this.providerCache, this.credentialRefName, models])
    const cached = this.routeProfileValue
    if (this.routeProfileKey !== key || cached === undefined) {
      const next = new Map<string, ResolvedPiAiProviderProfile>()
      if (this.signedIn) {
        const adopted = models
        const profile = resolveAnthropicProfile({
          provider: ROUTE,
          displayName: 'Z.ai 账号',
          baseURL: ANTHROPIC_BASE_BY_PROVIDER[this.providerCache],
          apiKeyEnv: this.credentialRefName,
          models: adopted.map(row => ({
            id: row.id,
            ...(row.name === undefined ? {} : { name: row.name }),
            ...(row.contextWindow === undefined ? {} : { contextWindow: row.contextWindow }),
            ...(row.maxTokens === undefined ? {} : { maxTokens: row.maxTokens }),
          })),
        })
        next.set(ROUTE, profile)
      } else {
        next.set(ROUTE, resolveAnthropicProfile({
          provider: ROUTE,
          displayName: 'Z.ai 账号',
          baseURL: ANTHROPIC_BASE_BY_PROVIDER[this.providerCache],
          apiKeyEnv: this.credentialRefName,
          models: [],
        }))
      }
      this.routeProfileValue = next
      this.routeProfileKey = key
    }
    return this.routeProfileValue as ReadonlyMap<string, ResolvedPiAiProviderProfile>
  }

  private routeProfileKey = ''
  private routeProfileValue: ReadonlyMap<string, ResolvedPiAiProviderProfile> | undefined

  private registerProvider(ctx: Context): void {
    // The directory entry is what the Models page renders as this account's
    // row: the account-backed shape (visibility rides the sign-in, not a
    // stored key) with a fixed place ahead of the rest, and the settings
    // address whose `models` key the page's editor writes the adopted
    // catalog into. The hub registration's provider names the same route, so
    // the account's models card joins the row.
    ctx.llm.registerConfigurableProviders([
      {
        provider: ROUTE,
        displayName: 'Z.ai 账号',
        settingsNs: this.settingsNs,
        settingsPath: [],
        accountProvider: true,
      },
    ])
    ctx.llm.registerAdapter([ROUTE], new PiAiAdapter({
      profiles: () => this.routeProfiles(),
      resolveApiKey: async (_provider, profile) => {
        const ref = profile.apiKeyEnv ?? credentialRef(this.credentialRefName)
        const hit = await this.ctx.credentials.resolve(ref)
        const value = hit?.value
        if (value === undefined || value === '') {
          throw new LlmError(
            `GLM 账号还没有推理凭据：请先登录账号，登录后插件会自动铸造并注入 API Key（凭据引用 ${String(ref)}）。`,
            'MISSING_CREDENTIAL',
          )
        }
        return value
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
      const stored = await this.readGrant()
      if (stored === null) throw new LlmError('请先登录 Z.ai 账号，再获取可用模型。', 'GLM_SIGN_IN_REQUIRED')
      const provider = stored.provider ?? 'zai'
      const baseUrl = typeof request.baseURL === 'string' && request.baseURL.trim() !== ''
        ? request.baseURL.trim()
        : (provider === 'bigmodel' ? DEFAULT_BIGMODEL_BASE_URL : DEFAULT_BASE_URL)
      // The /models endpoint accepts the OAuth token too, so discovery works
      // even before the first provisioned key lands.
      const probeKey = typeof request.apiKey === 'string' && request.apiKey.trim() !== ''
        ? request.apiKey.trim()
        : undefined
      const apiKey = stored.apiKey?.trim()
      const token = probeKey ?? (apiKey === undefined || apiKey === '' ? stored.token : apiKey)
      const signal = AbortSignal.any([this.requestLifetime.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      const ids = await readModels({ baseUrl, token, signal })
      if (ids.length === 0) throw new LlmError('该凭据下没有可用模型。', 'GLM_NO_MODELS')
      return ids.map(id => ({ id, name: id }))
    })
  }

  /** The ZCode endpoint origin hosting the CLI flow endpoints and the
   *  official hand-off page. */
  get zcodeOrigin(): string {
    const configured = this.config.zcodeOrigin?.get()?.trim()
    return configured === undefined || configured === '' ? DEFAULT_ZCODE_ORIGIN : configured.replace(/\/+$/, '')
  }

  // ---- hub registration ------------------------------------------------------

  private registerHub(ctx: Context): void {
    const dispose = ctx.accountHub.register({
      id: ID,
      displayName: 'Z.ai 账号',
      settingsNs: this.settingsNs,
      // The models-page row id this account backs: the route the plugin
      // registers its own directory entry and adapter under (see
      // registerProvider).
      provider: ROUTE,
      modelsCard: true,
      // Credential-inject: the route resolves onto the harness's pi-ai
      // Anthropic wire; the plugin only supplies the provisioned key
      // (injected under the route's `apiKeyEnv` reference) and the endpoint
      // facts around it.
      type: 'chat',
      workMode: 'credential-inject',
      card: CARD,
      invoke: (method: string) => this.invoke(method),
      getState: () => {
        this.refreshBalanceOnView()
        return this.view as unknown as JsonValue
      },
    })
    ctx.effect(() => dispose, 'zai-account-external: hub registration')
  }

  /** Forward one hub-card operation to its implementation. */
  private async invoke(method: string): Promise<JsonValue> {
    switch (method) {
      case 'sign-in': {
        // The provenance gate: an upstream drift refuses every new login.
        const drift = await this.versionGateRefusal()
        if (drift !== undefined) return { message: drift, error: true }
        await this.startBrowserSignIn('zai')
        return { message: this.view.text ?? '已登录' }
      }
      case 'sign-in-bigmodel': {
        // The provenance gate: an upstream drift refuses every new login.
        const drift = await this.versionGateRefusal()
        if (drift !== undefined) return { message: drift, error: true }
        await this.startBrowserSignIn('bigmodel')
        return { message: this.view.text ?? '已登录' }
      }
      case 'sign-out': {
        await this.signOut()
        return { message: '已退出登录。' }
      }
      default: throw new Error(`未知账号操作 "${method}"`)
    }
  }

  // ---- published state -------------------------------------------------------

  /** Whether the user-layer `models` write is confirmed present. */
  private modelsRowReady = false

  /** The models page keys an account-backed row's visibility on the live
   *  catalog OR an explicit user-layer `models` write. With the default
   *  catalog gone a freshly signed-in account serves none, so sign-in
   *  plants one empty write — the row (and its card) stays reachable for
   *  the first adopt. An existing write (adoption, deliberate clearing) is
   *  never touched; the field is declared volatile, so the write goes
   *  through the same official settings seam the models page itself uses.
   *
   *  Early-boot care: while the settings projection has not merged the user
   *  patch layer yet, `describe()` finds no row for this namespace at all.
   *  Writing then would clobber an adopted catalog persisted by a previous
   *  session with an empty array (observed: a saved catalog was wiped on
   *  every restart). A missing row means "projection not ready" — skip and
   *  let the next publish retry; only a present row with no `models` key is
   *  a confirmed first plant. */
  private async ensureModelsPageRow(): Promise<void> {
    if (this.modelsRowReady || !this.signedIn) return
    try {
      const row = this.ctx.settings.describe().find(row => row.ns === this.settingsNs)
      if (row === undefined) return
      const user = row.user
      if (typeof user === 'object' && user !== null && 'models' in user) {
        this.modelsRowReady = true
        return
      }
      await this.ctx.settings.mutate(this.settingsNs, [{ op: 'set', path: ['models'], value: [] }])
      this.modelsRowReady = true
    } catch {
      // The next publish retries; the row stays hidden until the write lands.
    }
  }

  /** Recompute the hub-visible state: an in-flight attempt, the signed-in
   *  identity, or the signed-out brand row. */
  private publish(): void {
    void this.ensureModelsPageRow()
    if (this.attemptText !== undefined) {
      this.view = { text: this.attemptText, level: 'warn', signedIn: false, signingIn: true, brand: BRAND }
    } else if (this.signedIn) {
      const who = this.profileCache?.name ?? this.profileCache?.contact
      const home = this.providerCache === 'bigmodel' ? DEFAULT_BIGMODEL_ORIGIN : this.zaiOrigin
      this.view = {
        text: who === undefined ? '已登录' : `已登录 · ${who}`,
        level: 'ok',
        signedIn: true,
        brand: BRAND,
        identity: {
          name: this.profileCache?.name,
          contact: this.profileCache?.contact,
          avatarUrl: this.profileCache?.avatarUrl,
          infoLabel: '账号信息',
          infoUrl: `${home}/`,
        },
        // The balance card mirrors the grant's platform: a Z.ai login shows
        // the live plan balance (fetched in the background, console link on
        // failure), a BigModel login keeps the console link — its quota
        // endpoint needs a second zcode JWT this flow does not hold.
        balance: {
          rows: this.balanceCache ?? [{ label: '余额', unavailable: { label: '在控制台查看', href: `${home}/` } }],
          more: [{ label: '更多', links: [{ label: '控制台', href: `${home}/`, primary: true }] }],
        },
      }
    } else {
      this.view = {
        text: this.versionNotice === undefined ? '未登录' : `未登录 · ${this.versionNotice}`,
        level: 'warn',
        signedIn: false,
        brand: BRAND,
      }
    }
    this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
  }

  private setPhase(phase: Phase | undefined): void {
    this.attemptText = phase === undefined ? undefined : PHASE_TEXT[phase]
    this.publish()
  }

  /** Re-read the balance in the background and republish. BigModel shows the
   *  monetary wallet (CNY, console account-report endpoint); Z.ai shows the
   *  Start Plan quota rows, falling back to its own wallet (USD) when the
   *  account holds no plan. API keys keep the console link. */
  private refreshBalance(): Promise<void> {
    return (async (): Promise<void> => {
      const stored = await this.readGrant()
      const zcodeJwt = stored?.kind === 'oauth' ? stored.zcodeJwt?.trim() : undefined
      if (stored === null || stored.kind !== 'oauth' || stored.token === '') {
        this.balanceCache = undefined
        this.publish()
        return
      }
      this.balanceCache = [{ label: '余额', loading: true }]
      this.publish()
      const signal = AbortSignal.any([this.requestLifetime.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      try {
        if ((stored.provider ?? 'zai') === 'bigmodel') {
          const line = await readMoneyBalance({
            origin: BIGMODEL_MONEY_ORIGIN, token: stored.token, currency: 'CNY',
            ...(zcodeJwt === undefined ? {} : { fallbackToken: zcodeJwt }), signal,
          })
          this.balanceCache = line === undefined ? undefined : [line]
        } else {
          const lines = zcodeJwt === undefined
            ? []
            : await readZaiBalance({ origin: this.zcodeOrigin, zcodeJwt, signal })
          if (lines.length === 0) {
            const line = await readMoneyBalance({
              origin: DEFAULT_BASE_URL.replace(/\/api\/paas\/v4\/?$/, ''), token: stored.token,
              currency: 'USD', ...(zcodeJwt === undefined ? {} : { fallbackToken: zcodeJwt }), signal,
            })
            this.balanceCache = line === undefined ? undefined : [line]
          } else {
            this.balanceCache = lines.map(line => ({ label: line.label, value: line.value }))
          }
        }
      } catch {
        this.balanceCache = undefined
      }
      this.publish()
    })().catch(() => undefined)
  }

  /** On-view balance refresh, mirroring the official account mechanism: the
   *  official client re-reads the wallets whenever a viewer opens the account
   *  surface and on every watch frame, with no background timer. The hub
   *  equivalent of "a viewer is looking" is `getState()` — the browser pulls
   *  it on mount and after each pushed change — so the read starts there,
   *  throttled so a publish → re-pull → getState cycle cannot re-arm itself
   *  into a fetch loop. */
  private refreshBalanceOnView(): void {
    if (!this.signedIn) return
    const now = Date.now()
    if (this.balanceRead !== undefined || now - this.lastBalanceRequest < VIEW_REFRESH_THROTTLE_MS) return
    this.lastBalanceRequest = now
    this.balanceRead = this.refreshBalance().finally(() => { this.balanceRead = undefined })
  }

  // ---- stored state ----------------------------------------------------------

  private async readGrant(): Promise<StoredGrant | null> {
    const active = await this.readActiveProvider()
    if (active === null) return null
    const record = await this.ctx.credentials.readRecord(grantKeyOf(active))
    if (record?.kind !== 'grant') return null
    const parsed = grant.safeParse(record.payload)
    // The record's key decides the platform: the payload's provider field is
    // history, the active selector is the fact the account serves.
    return parsed.success ? { ...parsed.data, provider: active } : null
  }

  /** The platform whose stored login the account serves, per the `active`
   *  selector; `null` means the account serves no stored login. */
  private async readActiveProvider(): Promise<OAuthProvider | null> {
    const record = await this.ctx.credentials.readRecord(ACTIVE)
    if (record?.kind !== 'grant') return null
    const parsed = ACTIVE_PROVIDER.safeParse(record.payload)
    return parsed.success ? parsed.data : null
  }

  private async setActiveProvider(provider: OAuthProvider): Promise<void> {
    await this.ctx.credentials.modifyRecord(ACTIVE, () =>
      Promise.resolve({ kind: 'grant' as const, payload: provider }))
  }

  /** Re-read the stored login and republish; seeds the identity from the
   *  profile captured at the last login. */
  private async ingestStoredState(): Promise<void> {
    await this.migrateLegacyGrant()
    const stored = await this.readGrant()
    if (stored === null) {
      this.signedIn = false
      this.profileCache = undefined
      this.publish()
      return
    }
    this.signedIn = true
    this.providerCache = stored.provider ?? 'zai'
    this.refreshBalance()
    this.provisionInferenceKey(stored).catch(() => undefined)
    const existingKey = stored.apiKey?.trim()
    if (existingKey !== undefined && existingKey !== '') void this.syncCredentialRef(existingKey)
    await this.seedProfileFromDevice()
    this.publish()
  }

  /** Give the account its own inference key: an OAuth token identifies the
   *  user but standard inference endpoints refuse it, so the plugin mirrors
   *  ZCode and provisions an API key through the business console (reuse the
   *  plugin-owned key, create it when absent, copy its secret). Failure is
   *  quiet — the next ingest retries, and inference then reports the fallback
   *  error the adapter surfaces. */
  private async provisionInferenceKey(stored: StoredGrant): Promise<void> {
    if (stored.kind !== 'oauth') return
    if (stored.apiKey?.trim() !== undefined && stored.apiKey.trim() !== '') return
    const provider = stored.provider ?? 'zai'
    const apiKey = await resolveBizApiKey({
      origin: provider === 'bigmodel' ? BIGMODEL_BIZ_ORIGIN : ZAI_BIZ_ORIGIN,
      token: stored.token,
      bearer: provider !== 'bigmodel',
      signal: AbortSignal.any([this.requestLifetime.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    })
    if (apiKey === undefined) return
    // Re-read before writing: a sign-out or a re-login may have moved the
    // record between the provision and this write.
    const current = await this.readGrant()
    if (current === null || current.kind !== 'oauth' || current.token !== stored.token) return
    await this.ctx.credentials.modifyRecord(grantKeyOf(current.provider ?? 'zai'), () =>
      Promise.resolve({ kind: 'grant' as const, payload: { ...current, apiKey } }))
    await this.syncCredentialRef(apiKey)
    this.publish()
  }

  /** Make the harness-facing credential reference carry the provisioned
   *  key: the native Anthropic route resolves its API key through this ref
   *  (its `apiKeyEnv`), so injection — not configuration — is what connects
   *  a signed-in account to inference. Idempotent: a matching value is left
   *  untouched, and a failure only delays the next ingest's retry. */
  private async syncCredentialRef(apiKey: string): Promise<void> {
    try {
      const ref = credentialRef(this.credentialRefName)
      const current = (await this.ctx.credentials.resolve(ref))?.value
      if (current === apiKey) return
      await this.ctx.credentials.set(ref, apiKey)
    } catch { /* The route stays keyless until the next ingest retries. */ }
  }

  private async seedProfileFromDevice(): Promise<void> {
    if (this.profileCache !== undefined) return
    const record = await this.ctx.credentials.readRecord(userKeyOf(this.providerCache))
    if (record?.kind !== 'grant') return
    const parsed = device.safeParse(record.payload)
    if (!parsed.success || parsed.data.user === undefined) return
    this.profileCache = profileOf(parsed.data.user)
  }

  private async storeGrant(next: StoredGrant, user?: unknown): Promise<void> {
    const provider = next.provider ?? 'zai'
    await this.ctx.credentials.modifyRecord(grantKeyOf(provider), () =>
      Promise.resolve({ kind: 'grant' as const, payload: next }))
    await this.setActiveProvider(provider)
    if (user !== undefined) await this.storeDeviceUser(provider, user)
  }

  /** ZCode alignment: each login overwrites its own platform's captured
   *  identity, keeping the record's device id stable — the identity shown
   *  after a restart always belongs to the active login. */
  private async storeDeviceUser(provider: OAuthProvider, user: unknown): Promise<void> {
    await this.ctx.credentials.modifyRecord(userKeyOf(provider), current => {
      const previous = current?.kind === 'grant' ? device.safeParse(current.payload) : undefined
      const id = previous !== undefined && previous.success
        ? previous.data.id
        : randomBytes(16).toString('hex')
      return Promise.resolve({ kind: 'grant' as const, payload: { id, user } })
    })
  }

  /** One-time lift of the pre-alignment single-grant record into the
   *  per-provider store. The legacy captured identity is deliberately not
   *  migrated: it may name an older login's platform, and a fresh identity
   *  arrives with the next sign-in. */
  private async migrateLegacyGrant(): Promise<void> {
    try {
      if (await this.readActiveProvider() !== null) return
      const record = await this.ctx.credentials.readRecord(LEGACY_KEY)
      if (record?.kind !== 'grant') return
      const parsed = grant.safeParse(record.payload)
      if (!parsed.success) return
      const provider = parsed.data.provider ?? 'zai'
      await this.ctx.credentials.modifyRecord(grantKeyOf(provider), () =>
        Promise.resolve({ kind: 'grant' as const, payload: parsed.data }))
      await this.setActiveProvider(provider)
      await this.ctx.credentials.deleteRecord(LEGACY_KEY)
      await this.ctx.credentials.deleteRecord(LEGACY_DEVICE)
    } catch { /* The legacy record is retried on the next boot. */ }
  }

  private async forgetCredential(): Promise<void> {
    const active = await this.readActiveProvider()
    if (active !== null) {
      // Sign-out clears the active platform only; the other platform's stored
      // grant, if any, stays dormant exactly as ZCode's shared store does.
      await this.ctx.credentials.deleteRecord(grantKeyOf(active))
      await this.ctx.credentials.deleteRecord(userKeyOf(active))
    }
    await this.ctx.credentials.deleteRecord(ACTIVE)
    // The injected key must not outlive the login: drop the reference so the
    // native route loses its credential exactly when the account does.
    await this.ctx.credentials.unset(credentialRef(this.credentialRefName)).catch(() => undefined)
    this.signedIn = false
    this.providerCache = 'zai'
    this.profileCache = undefined
    this.balanceCache = undefined
    this.publish()
  }

  // ---- browser sign-in -------------------------------------------------------

  /** One browser authorization attempt: ask the platform for a flow, send the
   *  browser to the authorize URL with the official hand-off redirect, and
   *  collect the token by polling. No local listener and no deep-link scheme
   *  are involved: the hand-off page's own forwarding is best-effort, and the
   *  poll is the reliable path that completes the sign-in either way. */
  private async startBrowserSignIn(provider: OAuthProvider): Promise<void> {
    if (this.attemptText !== undefined) return

    const origin = this.zcodeOrigin
    const deadline = new AbortController()
    const timer = setTimeout(() => { deadline.abort() }, ATTEMPT_TIMEOUT_MS)
    const signal = AbortSignal.any([this.requestLifetime.signal, deadline.signal])

    try {
      this.setPhase('initializing')
      const flow = await startCliFlow({ origin, provider, signal })

      this.setPhase('waiting-browser')
      const authorizeUrl = new URL(flow.authorizeUrl)
      authorizeUrl.searchParams.set(handoffParam(provider), desktopHandoffRedirect(origin))
      // The gesture fails soft: a missing browser keeps the attempt cancellable
      // and the URL stays in the host log for manual use.
      void openNativePath(authorizeUrl.toString(), signal).catch((error: unknown) => {
        console.info('[zai-account] browser open failed', {
          error: error instanceof Error ? error.message : String(error), authorizeUrl: authorizeUrl.toString(),
        })
      })

      this.setPhase('exchanging')
      const ready = await this.pollUntilReady(flow, provider, signal)

      this.setPhase('committing')
      const issuer = provider === 'bigmodel' ? DEFAULT_BIGMODEL_ORIGIN : this.zaiOrigin
      // ZCode's normalizePolledTokenSet contract: the Z.AI poll token is an
      // OAuth grant, not what the business interfaces accept — exchange it
      // here so the stored grant is the platform JWT from login on.
      let credential = ready.token
      let expiresAt: number | undefined
      if (provider === 'zai') {
        const business = await exchangeZaiBusinessToken({ token: ready.token, signal })
        credential = business.token
        expiresAt = business.expiresAt
      }
      const stored: StoredGrant = {
        version: 1, kind: 'oauth', provider, token: credential, issuer,
        ...(expiresAt === undefined ? {} : { expiresAt }),
        ...(ready.refreshToken === undefined ? {} : { refreshToken: ready.refreshToken }),
        ...(ready.zcodeJwt === undefined ? {} : { zcodeJwt: ready.zcodeJwt }),
      }
      await this.storeGrant(stored, ready.user)
      this.signedIn = true
      this.providerCache = provider
      this.profileCache = profileOf(ready.user)
      this.refreshBalance()
      void this.provisionInferenceKey(stored).catch(() => undefined)
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

  /** Poll the platform flow until it leaves `pending`; the server hands back
   *  the credential itself, so a missed browser hand-off still completes. */
  private async pollUntilReady(flow: CliFlow, provider: OAuthProvider, signal: AbortSignal): Promise<{ token: string; refreshToken?: string; zcodeJwt?: string; user: unknown }> {
    for (;;) {
      signal.throwIfAborted()
      if (Date.now() >= flow.expiresAt) throw new Error('登录超时，请重试。')
      const poll = await pollCliFlow({
        origin: this.zcodeOrigin, flowId: flow.flowId, pollToken: flow.pollToken, provider, signal,
      })
      if (poll.status === 'ready') {
        return {
          token: poll.token, user: poll.user,
          ...(poll.refreshToken === undefined ? {} : { refreshToken: poll.refreshToken }),
          ...(poll.zcodeJwt === undefined ? {} : { zcodeJwt: poll.zcodeJwt }),
        }
      }
      if (poll.status === 'failed') throw new Error('Z.ai 授权失败，请重试。')
      await new Promise<void>((resolve, reject) => {
        const onAbort = (): void => { clearTimeout(timer); reject(signal.reason) }
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort)
          resolve()
        }, flow.pollIntervalMs)
        signal.addEventListener('abort', onAbort, { once: true })
      })
    }
  }

  /** Drop the local login. A remote revocation is not attempted: this flow
   *  has no token revocation endpoint it can trust. */
  private async signOut(): Promise<void> {
    // Session-scoped adoption: drop the managed `models` value so the models
    // page's visibility rule no longer pins the group after sign-out.
    await this.ctx.settings.mutate(this.settingsNs, [{ op: 'unset', path: ['models'] }])
    this.removing ??= this.forgetCredential().finally(() => { this.removing = undefined })
    await this.removing
  }
}
