/**
 * Qwen account component of `dsh-private-plugin-qwen-ability`.
 *
 * One account product the harness core does not ship: the Qwen login and the
 * account-hub registration whose declarative card renders the whole settings
 * row. The login mirrors what current qwen-code ships after the OAuth free
 * tier was discontinued (2026-04-15): a ModelStudio key pasted against the
 * endpoint tier it belongs to — Coding Plan, Token Plan, or the plain
 * DashScope compatible-mode endpoint — with the endpoint preset table and
 * console links taken straight from the official provider documentation.
 * (The old device-code OAuth flow this component once mirrored is dead
 * server-side: the authorize page serves an app-download banner and the
 * token endpoint sits behind an Aliyun WAF block rule answering 405.)
 *
 * Work mode is credential-inject in its purest form: the account mounts its
 * own models-page route on the harness's pi-ai adapter family, and the
 * adapter's `resolveApiKey` calls back into this service, which reads the
 * key per request. The paste field lives in the component configuration;
 * the fact is mirrored into the credentials store as a `grant` record — the
 * management surface the hub's credential views read — and clearing it (the
 * card's sign-out gesture) removes both sides.
 *
 * Model discovery probes the endpoint's `GET /models` for the adopted
 * catalog; the signed-out route stays **owned but empty** so the desktop
 * model selector never renders a「加载失败」warning bar.
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
import type {} from '@dsh-private/api-account-hub'
import { ACCOUNT_HUB_CHANGED } from '@dsh-private/api-account-hub'
import type { AccountHubCardState } from '@dsh-private/api-account-hub'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import zschema from '@deepseek-ai/schemastery'
import { CARD } from './card.ts'
import { emptyCredentialStore, resolveOpenAiProfile, staticAuthContext } from './pi-ai-bridge.ts'
import { ENDPOINT_PRESETS, findPreset, presetLabel, readModels } from './protocol.ts'
import type { EndpointPreset } from './protocol.ts'

/** Stable identity: hub account id and entry id fallback. */
export const name = 'qwen-account-external'
const ID = name

const REQUEST_TIMEOUT_MS = 30_000

/** The pi-ai route this account mounts. */
const ROUTE = 'Qwen-account'
/** The credential reference name the profile renders. */
const DEFAULT_CREDENTIAL_REF_NAME = 'QWEN_API_KEY'

/** The DashScope catalog's dependable coding default, used before any
 *  discovery run; everything else arrives through model discovery. */
const DEFAULT_ROUTE_MODELS: readonly ModelRow[] = [
  { id: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus', contextWindow: 262_144, maxTokens: 32_768 },
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
  apiKey?: VolatileBox<string>
  plan?: VolatileBox<string>
  region?: VolatileBox<string>
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
  apiKey: zschema.string().volatile(),
  plan: zschema.string().volatile(),
  region: zschema.string().volatile(),
  customBaseUrl: zschema.string().volatile(),
  models: zschema.array(modelRow).volatile(),
}) as unknown as SchemaNode

/** The brand line both card states draw; the logo lets the hub render the
 *  signed-out card as the single-line brand row (logo + name + action). */
const LOGO_DATA_URI: string | undefined = (() => {
  try {
    const svg = readFileSync(new URL('../assets/qwen-logo.svg', import.meta.url), 'utf8')
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
  } catch {
    return undefined
  }
})()
const BRAND = Object.freeze({ logoUrl: LOGO_DATA_URI, name: 'Qwen 账号' })

/** The credential record key the pasted key is mirrored into. */
const GRANT = credentialKey(ID, 'grant')

/** The default tier: qwen-code's recommended Coding Plan entry. */
const CODING_PLAN_CN: EndpointPreset = ENDPOINT_PRESETS[0] as EndpointPreset

/** The grant payload mirrored into the credentials store. */
interface StoredGrant {
  readonly version: 1
  readonly apiKey: string
  readonly baseUrl: string
  readonly endpointLabel: string
}

/**
 * The account service. Hosting services (llm, accountHub, settings,
 * credentials) arrive through injection; the plugin registers its route and
 * hub card in its constructor, and re-ingests whenever the configuration or
 * the credential record moves — the pasted key and the stored grant mirror
 * each other, with the configuration as the input and the credentials store
 * as the management fact.
 */
export default class QwenAccountExternal extends Service {
  static inject = ['llm', 'accountHub', 'settings', 'credentials']
  static Config = Config

  private readonly settingsNs: string
  private readonly config: Config
  private readonly requestLifetime = new AbortController()

  /** The mirrored grant, re-read by ingest; null when signed out. */
  private stored: StoredGrant | null = null
  private view: AccountHubCardState = { text: '未登录', level: 'warn', signedIn: false, brand: BRAND }

  /** @param ctx - host context. @param config - plugin configuration. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'qwenAccount')
    this.settingsNs = ctx.fiber?.entry?.options.id ?? ID
    this.config = config

    // Configuration edits re-sync the mirror; credential edits (from this
    // mirror or any other writer) republish the card.
    ctx.on('settings/document-updated', (ns: string) => {
      if (ns !== this.settingsNs) return
      void this.ingest()
    })
    ctx.on('credentials/record-updated', (key: CredentialKey) => {
      if (key !== GRANT) return
      void this.refreshStored()
    })

    ctx.effect(() => () => { this.requestLifetime.abort() }, 'qwen-account-external: request lifetime')

    this.registerProvider(ctx)
    this.registerHub(ctx)
    void this.ingest()
  }

  // ---- configuration reads --------------------------------------------------

  /** The pasted ModelStudio API key, or '' when the field is empty. */
  get apiKeyValue(): string {
    return this.config.apiKey?.get()?.trim() ?? ''
  }

  /** Whether a login fact exists — the pasted key or its stored mirror. */
  get signedIn(): boolean {
    return this.apiKeyValue !== '' || this.stored !== null
  }

  /** The configured endpoint preset (falls back to qwen-code's recommended
   *  Coding Plan entry when the pair is unset or unknown). */
  get endpointPreset(): EndpointPreset {
    const plan = this.config.plan?.get()?.trim() ?? ''
    const region = this.config.region?.get()?.trim() ?? ''
    return findPreset(plan, region) ?? CODING_PLAN_CN
  }

  /** The preset's display label: 「套餐 · 区域」. */
  get endpointLabel(): string {
    return presetLabel(this.endpointPreset)
  }

  /** The endpoint the key serves. A non-empty custom base URL wins over the
   *  preset (the escape hatch for endpoints the table does not list). */
  get baseUrlValue(): string {
    const custom = this.config.customBaseUrl?.get()?.trim() ?? ''
    if (custom !== '') return custom.replace(/\/+$/, '')
    const stored = this.stored
    if (stored !== null && this.apiKeyValue === '') return stored.baseUrl.replace(/\/+$/, '')
    return this.endpointPreset.baseUrl.replace(/\/+$/, '')
  }

  /** The ModelStudio console page where this tier's key is created. */
  get consoleUrl(): string {
    return this.endpointPreset.consoleUrl
  }

  /** The adopted model catalog, if any. */
  get adoptedModelsValue(): readonly ModelRow[] {
    return this.config.models?.get() ?? []
  }

  /** The credential reference name the profile renders. */
  get credentialRefName(): string {
    return DEFAULT_CREDENTIAL_REF_NAME
  }

  // ---- credential mirror ------------------------------------------------------

  private async readStored(): Promise<StoredGrant | null> {
    const record = await this.ctx.credentials.readRecord(GRANT)
    if (record?.kind !== 'grant') return null
    const payload = record.payload as Partial<StoredGrant> | undefined
    if (typeof payload?.apiKey !== 'string' || payload.apiKey === '') return null
    return {
      version: 1,
      apiKey: payload.apiKey,
      baseUrl: typeof payload.baseUrl === 'string' ? payload.baseUrl : this.endpointPreset.baseUrl,
      endpointLabel: typeof payload.endpointLabel === 'string' ? payload.endpointLabel : '',
    }
  }

  /** Re-read the stored grant and republish (credential-side changes). */
  private async refreshStored(): Promise<void> {
    this.stored = await this.readStored()
    this.routeProfileKey = ''
    this.publish()
  }

  /** Sync the pasted key into the credentials mirror — the whole login and
   *  the whole logout, driven by configuration edits. */
  private async ingest(): Promise<void> {
    const pasted = this.apiKeyValue
    const stored = await this.readStored()
    if (pasted !== '') {
      if (stored === null || stored.apiKey !== pasted
        || stored.baseUrl !== this.baseUrlValue || stored.endpointLabel !== this.endpointLabel) {
        const next: StoredGrant = {
          version: 1,
          apiKey: pasted,
          baseUrl: this.baseUrlValue,
          endpointLabel: this.endpointLabel,
        }
        await this.ctx.credentials.modifyRecord(GRANT, () => Promise.resolve({ kind: 'grant' as const, payload: next }))
        this.stored = next
      }
    } else if (stored !== null) {
      // The paste field was cleared: drop the mirror with it.
      await this.ctx.credentials.deleteRecord(GRANT)
      this.stored = null
    }
    this.routeProfileKey = ''
    this.publish()
  }

  /** The key a request should present: the stored mirror first (the managed
   *  fact), falling back to the paste field while the mirror catches up. */
  private async resolveKey(): Promise<string> {
    const stored = this.stored?.apiKey ?? (await this.readStored())?.apiKey
    if (stored !== undefined && stored !== '') return stored
    const pasted = this.apiKeyValue
    if (pasted !== '') return pasted
    throw new LlmError('Qwen 账号还没有登录：请在本组件配置中粘贴百炼 API Key。', 'MISSING_CREDENTIAL')
  }

  // ---- route registration -----------------------------------------------------

  private routeProfiles(): ReadonlyMap<string, ResolvedPiAiProviderProfile> {
    const models = this.adoptedModelsValue
    const signedIn = this.signedIn
    const baseUrl = this.baseUrlValue
    const key = JSON.stringify([signedIn, baseUrl, this.credentialRefName, models])
    const cached = this.routeProfileValue
    if (this.routeProfileKey !== key || cached === undefined) {
      const next = new Map<string, ResolvedPiAiProviderProfile>()
      // While signed out the route stays **owned but empty**: a missing
      // profile would make `listModels` throw NO_ADAPTER, which the desktop
      // model selector renders as a「加载失败」warning bar.
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
      const baseUrl = typeof request.baseURL === 'string' && request.baseURL.trim() !== ''
        ? request.baseURL.trim()
        : this.baseUrlValue
      const signal = AbortSignal.any([this.requestLifetime.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      const ids = await readModels({ baseUrl: baseUrl.replace(/\/+$/, ''), token: key, signal })
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
      invoke: (method: string, args: JsonValue) => this.invoke(method, args),
      getState: () => this.view as unknown as JsonValue,
    })
    ctx.effect(() => dispose, 'qwen-account-external: hub registration')
  }

  /** Forward one hub-card operation to its implementation. Dialog submits
   *  arrive as `{ values: { …card values, …dialog inputs } }` — the modal's
   *  `apiKey` input is the whole sign-in. */
  private async invoke(method: string, args?: JsonValue): Promise<JsonValue> {
    switch (method) {
      case 'sign-in': {
        const values = (args !== null && typeof args === 'object' && 'values' in args
          ? (args as { values: Record<string, unknown> }).values
          : {}) ?? {}
        const pasted = typeof values.apiKey === 'string' ? values.apiKey.trim() : ''
        if (pasted === '') {
          return { message: '请先粘贴百炼 API Key。', error: true }
        }
        await this.signIn(pasted)
        return { message: '登录成功：API Key 已保存并同步到凭据管理。', close: true }
      }
      case 'sign-out': {
        await this.signOut()
        return { message: '已退出登录：配置中的 API Key 与凭据记录均已清除。' }
      }
      case 'update-endpoint': {
        const values = (args !== null && typeof args === 'object' && 'values' in args
          ? (args as { values: Record<string, unknown> }).values
          : {}) ?? {}
        const plan = typeof values.plan === 'string' ? values.plan : ''
        const region = typeof values.region === 'string' ? values.region : ''
        const preset = findPreset(plan, region)
        if (preset === undefined) {
          return { message: '请先选择套餐与区域。', error: true }
        }
        await this.updateEndpoint(preset)
        return { message: `已切换到 ${presetLabel(preset)}，推理端点：${preset.baseUrl}`, close: true }
      }
      default: throw new Error(`未知账号操作 "${method}"`)
    }
  }

  // ---- published state --------------------------------------------------------

  /** Recompute the hub-visible state: the signed-in fact or the signed-out
   *  brand row. */
  private publish(): void {
    if (this.signedIn) {
      const endpoint = this.baseUrlValue
      this.view = {
        text: '已登录 · 百炼 API Key',
        level: 'ok',
        signedIn: true,
        brand: BRAND,
        identity: {
          name: 'Qwen 账号',
          infoLabel: '控制台',
          infoUrl: this.consoleUrl,
        },
        balance: {},
        details: {
          rows: [
            { label: '端点预设', value: this.endpointLabel },
            { label: '推理端点', value: endpoint },
          ],
        },
      }
    } else {
      this.view = { text: '未登录', level: 'warn', signedIn: false, brand: BRAND }
    }
    this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
  }

  // ---- sign-in / sign-out -------------------------------------------------------

  /** The sign-in gesture: store the pasted key into the namespace's `apiKey`
   *  field. The settings event re-ingests, which mirrors the key into the
   *  credentials store — the same path a manual config edit takes. */
  private async signIn(apiKey: string): Promise<void> {
    await this.ctx.settings.mutate(this.settingsNs, [
      { op: 'set', path: ['apiKey'], value: apiKey },
    ])
    await this.ingest()
  }

  /** The endpoint-switch gesture (the「插件设置」modal): store the chosen
   *  (plan, region) pair. The settings event re-ingests, which re-mirrors
   *  the grant's endpoint facts alongside. */
  private async updateEndpoint(preset: EndpointPreset): Promise<void> {
    await this.ctx.settings.mutate(this.settingsNs, [
      { op: 'set', path: ['plan'], value: preset.plan },
      { op: 'set', path: ['region'], value: preset.region },
    ])
    await this.ingest()
  }

  /** Clear the login on both sides: the paste field (settings unset) and the
   *  stored mirror (credentials delete). */
  private async signOut(): Promise<void> {
    await this.ctx.settings.mutate(this.settingsNs, [
      { op: 'unset', path: ['apiKey'] },
      { op: 'unset', path: ['customBaseUrl'] },
    ])
    await this.ctx.credentials.deleteRecord(GRANT)
    this.stored = null
    this.routeProfileKey = ''
    this.publish()
  }
}
