/**
 * Qwen account component of `dsh-private-plugin-qwen-ability`.
 *
 * One account product the harness core does not ship: the Qwen login and the
 * account-hub registration whose declarative card renders the whole settings
 * row. The original OAuth device-authorization flow this component once
 * mirrored (qwen-code's grant against `chat.qwen.ai`) is dead server-side —
 * Alibaba discontinued the Qwen OAuth free tier on 2026-04-15; the authorize
 * page now serves an app-download banner and the token endpoint sits behind
 * an Aliyun WAF block rule answering 405. The login is therefore a ModelStudio
 * (百炼) API key: the card's gesture opens the console's key page, the key is
 * pasted into this component's configuration, and the route speaks
 * `openai-completions` against DashScope's OpenAI-compatible endpoint
 * (domestic or international station, or a custom endpoint — the Coding
 * Plan's dedicated base URL — when one is entered).
 *
 * Work mode is credential-inject in its purest form: the account mounts its
 * own models-page route on the harness's pi-ai adapter family, and the
 * adapter's `resolveApiKey` calls back into this service, which reads the
 * configured key per request. A missing key means signed out; clearing the
 * field (the card's sign-out gesture unsets it) is the whole logout.
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

import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
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
import zschema from '@deepseek-ai/schemastery'
import { CARD } from './card.ts'
import { emptyCredentialStore, resolveOpenAiProfile, staticAuthContext } from './pi-ai-bridge.ts'
import {
  QWEN_BASE_URL_CN, QWEN_BASE_URL_INTL, QWEN_CONSOLE_URL_CN, QWEN_CONSOLE_URL_INTL, readModels,
} from './protocol.ts'

/** Stable identity: hub account id and entry id fallback. */
export const name = 'qwen-account-external'
const ID = name

const REQUEST_TIMEOUT_MS = 30_000

/** The pi-ai route this account mounts. */
const ROUTE = 'Qwen-account'
/** The credential reference name the profile renders (display only — the key
 *  is served per request by the resolve override). */
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
  endpoint?: VolatileBox<'国内站' | '国际站'>
  customBaseUrl?: VolatileBox<string>
  models?: VolatileBox<ModelRow[]>
}

/** The DashScope station presets the endpoint field offers. */
const STATIONS = ['国内站', '国际站'] as const

/** The schema class instance type, nameable without dragging cosmokit into
 *  the declaration surface (any raw `object()` inference is not — its type
 *  intersects cosmokit's `Dict`). */
type SchemaNode = InstanceType<typeof zschema>

/** The configuration schema. The value is the plain schemastery object (the
 *  dropdown and volatile fields render untouched); the assertion only keeps
 *  the emitted declaration portable. */
export const Config = zschema.object({
  apiKey: zschema.string().volatile(),
  endpoint: zschema.union([...STATIONS]).volatile(),
  customBaseUrl: zschema.string().volatile(),
  models: zschema.array(modelRow).volatile(),
}) as unknown as SchemaNode

/** The brand line both card states draw. */
const BRAND = Object.freeze({ name: 'Qwen 账号' })

/**
 * The account service. Hosting services (llm, accountHub, settings) arrive
 * through injection; the plugin registers its route and hub card in its
 * constructor and republishes whenever the configured key or endpoint moves.
 */
export default class QwenAccountExternal extends Service {
  static inject = ['llm', 'accountHub', 'settings']
  static Config = Config

  private readonly settingsNs: string
  private readonly config: Config
  private readonly requestLifetime = new AbortController()

  private view: AccountHubCardState = { text: '未登录', level: 'warn', signedIn: false, brand: BRAND }

  /** @param ctx - host context. @param config - plugin configuration. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'qwenAccount')
    this.settingsNs = ctx.fiber?.entry?.options.id ?? ID
    this.config = config

    ctx.effect(() => () => { this.requestLifetime.abort() }, 'qwen-account-external: request lifetime')

    this.registerProvider(ctx)
    this.registerHub(ctx)
    this.publish()
  }

  // ---- configuration reads --------------------------------------------------

  /** The pasted ModelStudio API key, or '' when signed out. */
  get apiKeyValue(): string {
    return this.config.apiKey?.get()?.trim() ?? ''
  }

  /** Whether an API key is configured — the whole login fact. */
  get signedIn(): boolean {
    return this.apiKeyValue !== ''
  }

  /** The endpoint the configured key serves. A non-empty custom base URL
   *  (e.g. the Coding Plan's dedicated endpoint) wins over the station
   *  preset. */
  get baseUrlValue(): string {
    const custom = this.config.customBaseUrl?.get()?.trim() ?? ''
    if (custom !== '') return custom.replace(/\/+$/, '')
    const station = this.config.endpoint?.get() ?? '国内站'
    return (station === '国际站' ? QWEN_BASE_URL_INTL : QWEN_BASE_URL_CN).replace(/\/+$/, '')
  }

  /** The ModelStudio console page where a key is created, per station. */
  get consoleUrl(): string {
    const custom = this.config.customBaseUrl?.get()?.trim() ?? ''
    const station = this.config.endpoint?.get() ?? '国内站'
    if (custom !== '' || station === '国际站') return QWEN_CONSOLE_URL_INTL
    return QWEN_CONSOLE_URL_CN
  }

  /** The adopted model catalog, if any. */
  get adoptedModelsValue(): readonly ModelRow[] {
    return this.config.models?.get() ?? []
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

  /** The credential reference name the profile renders. */
  get credentialRefName(): string {
    return DEFAULT_CREDENTIAL_REF_NAME
  }

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
        const key = this.apiKeyValue
        if (key === '') {
          throw new LlmError('Qwen 账号还没有登录：请在本组件配置中粘贴百炼 API Key。', 'MISSING_CREDENTIAL')
        }
        return key
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
      const key = this.apiKeyValue
      if (key === '') throw new LlmError('Qwen 账号还没有登录：请先粘贴百炼 API Key。', 'MISSING_CREDENTIAL')
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
      invoke: (method: string) => this.invoke(method),
      getState: () => this.view as unknown as JsonValue,
    })
    ctx.effect(() => dispose, 'qwen-account-external: hub registration')
  }

  /** Forward one hub-card operation to its implementation. */
  private async invoke(method: string): Promise<JsonValue> {
    switch (method) {
      case 'sign-in': {
        await this.openConsole()
        return { message: '已打开百炼控制台：创建 API Key 后粘贴到本组件的配置中保存。' }
      }
      case 'sign-out': {
        await this.signOut()
        return { message: '已退出登录：配置中的 API Key 已清除。' }
      }
      default: throw new Error(`未知账号操作 "${method}"`)
    }
  }

  // ---- published state --------------------------------------------------------

  /** Recompute the hub-visible state: the signed-in fact or the signed-out
   *  brand row. */
  private publish(): void {
    if (this.signedIn) {
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
        balance: {
          rows: [{ label: '推理端点', value: this.baseUrlValue }],
          more: [{ label: '更多', links: [{ label: '百炼控制台', href: this.consoleUrl, primary: true }] }],
        },
      }
    } else {
      this.view = { text: '未登录', level: 'warn', signedIn: false, brand: BRAND }
    }
    this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
  }

  // ---- sign-in / sign-out -------------------------------------------------------

  /**
   * The sign-in gesture: open the ModelStudio console's key page in the
   * user's browser. The paste step happens in this component's configuration
   * form; storing the key is the whole login.
   */
  private async openConsole(): Promise<void> {
    try {
      await openNativePath(this.consoleUrl, this.requestLifetime.signal)
    } catch (error) {
      console.info('[qwen-account] browser open failed', {
        error: error instanceof Error ? error.message : String(error),
        consoleUrl: this.consoleUrl,
      })
    }
    this.view = {
      text: `请在配置中粘贴 API Key（控制台：${this.consoleUrl}）`,
      level: 'warn',
      signedIn: false,
      brand: BRAND,
    }
    this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
  }

  /** Clear the configured key — the whole logout. The field is volatile, so
   *  the unset lands without remounting the settings form. */
  private async signOut(): Promise<void> {
    await this.ctx.settings.mutate(this.settingsNs, [{ op: 'unset', path: ['apiKey'] }])
    this.publish()
  }
}
