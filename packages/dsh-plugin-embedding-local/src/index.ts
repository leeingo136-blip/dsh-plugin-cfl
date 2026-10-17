/**
 * Local embedding account plugin (self-contained form).
 *
 * A non-chat account product: the plugin serves vector embeddings entirely
 * inside the host process and declares itself to the hub with `type:
 * 'embedding'`, so the settings column places it in the embedding section
 * instead of reading as a conversation model. It registers no LLM adapter —
 * embedding has no seat on harness's chat inference path, and inventing one
 * would be a fake chat model.
 *
 * Model visibility is configuration-gated: the models-page card (served
 * through the hub's `modelsCard` seat) is the only place models are added or
 * removed, and every consumer face lists exactly the configured set — a
 * caller that asks for models sees nothing until the user配置 one.
 *
 * Faces, all official mechanisms:
 * - the `embedding` cordis service: other host plugins `ctx.get('embedding')`
 *   and call `embed` / `similarity` / `listModels`;
 * - the `embedding` remote namespace: the same operations over the typert
 *   wire, reachable from browser-side tools the way `accountHub.list` is;
 * - the hub card: load/unload gestures in the account
 *   column; model add/remove on the models page.
 *
 * Weights and runtime dependencies ship inside this package (`models/` and
 * `node_modules/`), resolved at run time from `import.meta.url`; activation
 * asks nothing of the host environment and patches nothing in harness.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-settings'
import type { DirectoryRegistrationHandle, LlmConfigurableProvider } from '@deepseek-ai/dsh-llm'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {} from '@dsh/api-account-hub'
import { ACCOUNT_HUB_CHANGED } from '@dsh/api-account-hub'
import type {
  AccountHubCardDescriptor, AccountHubCardState,
} from '@dsh/api-account-hub'
import zschema from '@deepseek-ai/schemastery'
import {
  currentDimensions, currentWeightFile, embed, isLoaded,
  listWeightFiles, loadedFile, onLoadChange, ready, selectWeight, similarity,
  unload, weightPresent,
} from './local-embed.ts'

/** Stable identity: hub account id, plugin entry name, and provider route. */
export const name = 'embedding-local'
const ID = name
/** The models-page provider route this account backs (no adapter rides it). */
const ROUTE = ID

/** Browser-safe failure vocabulary of the embedding remote face. */
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The embedding service is not mounted. */
    'embedding/unavailable': {}
    /** The request carried a non-string input. */
    'embedding/invalid-input': {}
    /** No model is configured; the models-page card is the only way to add one. */
    'embedding/no-model': {}
    /** The requested model id is not in the configured set. */
    'embedding/unknown-model': { readonly id: string }
    /** The engine failed to load a weight or run inference. */
    'embedding/engine-failed': {}
  }
}

/** The model id a weight file serves: the file stem (`bge-small-zh-v1.5`). */
const modelIdOf = (file: string): string => file.replace(/\.gguf$/i, '')

/** The hub card and directory title: 本地 + the actual model name — the
 *  default weight's stem with any quantization tag dropped
 *  (`bge-small-zh-v1.5-q8_0.gguf` reads as 本地 bge-small-zh-v1.5); the
 *  built-in default's name when no weight ships with the build. */
function accountDisplayName(): string {
  const model = modelIdOf(currentWeightFile()).replace(/[-.]q\d[\w]*$/i, '')
  return `本地 ${model}`
}

/** Fixed at build time: the catalog comes from the bundled `models/`
 *  directory, so the title never changes at runtime. The account column's
 *  card head and the models-page provider row both render it. */
const PROVIDER_NAME = accountDisplayName()

/** The one-line brand row the account column renders: logo + title, with
 *  the status and the load gesture beside them. Carrying `brand` in the
 *  card state selects this compact layout over the stacked head. */
const BRAND = Object.freeze({
  logoUrl: 'data:image/svg+xml;base64,'
    + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">`
      + `<rect x="1" y="1" width="22" height="22" rx="6" fill="#0f6e56"/>`
      + `<text x="12" y="16.5" font-family="Helvetica, Arial, sans-serif" font-size="10"`
      + ` font-weight="700" fill="#ffffff" text-anchor="middle">VE</text></svg>`, 'utf8').toString('base64'),
  name: PROVIDER_NAME,
})

/** One configured embedding model: the exposed id and its weight file. */
export interface AvailableModel {
  id: string
  file: string
}

/** A volatile Config field arrives from schemastery as a frozen lazy box. */
export interface VolatileBox<T> {
  readonly get: () => T
}

/** Plugin configuration type (all reads go through the settings service). */
export interface Config {
  enabled?: VolatileBox<boolean>
}

/** The schema class instance type, nameable without dragging cosmokit into
 *  the declaration surface (any raw `object()` inference is not — its type
 *  intersects cosmokit's `Dict`). */
type SchemaNode = InstanceType<typeof zschema>

/**
 * The schema carries exactly one field: `enabled`, the persisted load intent.
 * It must stay non-empty — a zero-field namespace never reaches the settings
 * projection, and the models page drops any provider row whose namespace it
 * cannot see. Volatile keeps the projection (and the write path) alive. The
 * model catalog itself stays build-time fixed: every weight in the bundled
 * `models/` directory is a model, its id the file stem.
 */
export const Config = zschema.object({
  enabled: zschema.boolean().default(false).volatile()
    .description('启用状态（重启后自动恢复上次启用的向量模型）'),
}) as unknown as SchemaNode

/** A model id resolution failure, mapped to the remote failure vocabulary. */
export class ModelResolutionError extends Error {
  constructor(readonly kind: 'no-model' | 'unknown-model', message: string, readonly modelId?: string) {
    super(message)
  }
}

/**
 * The public embedding service. Other host plugins reach it with
 * `ctx.get('embedding')`; the lazily loading engine keeps plugin activation
 * free of any model I/O. The catalog is fixed by the plugin itself: every
 * weight under `models/` is a model, so a build ships exactly the models it
 * promises and nothing at runtime can widen or shrink that set.
 */
export class EmbeddingService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'embedding')
  }

  /** The raw plugin-fixed catalog: every weight on disk, id = file stem. */
  availableModels(): readonly AvailableModel[] {
    return listWeightFiles().map(file => ({ id: modelIdOf(file), file }))
  }

  /** The models a caller may see, with on-disk/loaded facts. */
  listModels(): { id: string; file: string; loaded: boolean }[] {
    const resident = loadedFile()
    return this.availableModels()
      .filter(row => selectWeight(row.file) !== undefined)
      .map(row => ({ id: row.id, file: row.file, loaded: resident === row.file }))
  }

  /** Resolve a caller-named model (or the engine's default) to a weight file. */
  resolveModel(modelId?: string): AvailableModel {
    const catalog = this.availableModels()
    if (catalog.length === 0) {
      throw new ModelResolutionError('no-model', '插件未提供任何向量模型权重（models/ 目录为空）。')
    }
    if (modelId === undefined) {
      const fallback = catalog.find(one => selectWeight(one.file)?.file === currentWeightFile())
      return fallback ?? catalog[0]!
    }
    const row = catalog.find(one => one.id === modelId)
    if (row === undefined) {
      throw new ModelResolutionError('unknown-model', `插件未提供向量模型 "${modelId}"`, modelId)
    }
    return row
  }

  /** Embed one batch of texts against a plugin-provided model. */
  embed(inputs: readonly string[], modelId?: string): Promise<number[][]> {
    return embed(inputs, this.resolveModel(modelId).file)
  }

  /** Cosine similarity of two vectors produced by {@link embed}. */
  similarity(a: readonly number[], b: readonly number[]): number {
    return similarity(a, b)
  }

  /** Whether the weight is on disk and can load when needed. */
  isReady(): boolean {
    return ready()
  }
}

/**
 * The hub-facing account service: owns the card, the published state, the
 * models-page provider registration, and the card's invoke seam.
 * `signedIn` reads as "the weight is loaded", which is the local engine's
 * analogue of a signed-in session.
 */
export class EmbeddingAccount extends Service {
  static inject = ['llm', 'accountHub', 'embedding', 'settings']

  private readonly settingsNs: string
  private view: AccountHubCardState = {
    text: '未加载', level: 'warn', signedIn: false, brand: BRAND,
  }

  constructor(ctx: Context) {
    super(ctx, 'embeddingAccount')
    this.settingsNs = ctx.fiber?.entry?.options.id ?? ID
    ctx.on('settings/document-updated', (ns: string) => {
      if (ns !== this.settingsNs) return
      this.refresh()
    })
    this.registerProvider(ctx)
    this.registerHub(ctx)
    this.refresh()
    // The models-page row mirrors the engine: a resident weight keeps the
    // route in the directory, an unloaded engine withdraws it — the same
    // posture a signed-out account takes. Load/unload gestures (and the
    // lazy load any embed triggers) flip it through this subscription.
    ctx.effect(
      () => onLoadChange(() => { this.syncProviderRow() }),
      'embedding-local: engine load-state subscription',
    )
    this.syncProviderRow()
    this.restore()
  }

  private service(): EmbeddingService {
    return this.ctx.get('embedding') as EmbeddingService
  }

  // ---- models-page provider registration -------------------------------------

  /**
   * The models-page provider route. No adapter is ever registered for it, so
   * nothing here enters the chat model catalog — the route exists only to
   * give the models page a row whose editor hosts this account's card (the
   * hub's `modelsCard` seat). A plain declared route carries no key badge,
   * and an empty `settingsPath` reads as configured.
   *
   * The row is load-gated: {@link syncProviderRow} withdraws the entry while
   * no weight is resident and restores it once one loads, so an unloaded
   * engine reads exactly like a signed-out account — no card until the
   * account column's load gesture (or a caller's first embed) brings one up.
   */
  private providerHandle: DirectoryRegistrationHandle | undefined
  private providerRowVisible = false

  private registerProvider(ctx: Context): void {
    const handle = ctx.llm.registerConfigurableProviders([{
      provider: ROUTE,
      displayName: PROVIDER_NAME,
      settingsNs: this.settingsNs,
      settingsPath: [],
    }])
    this.providerHandle = handle
    this.providerRowVisible = true
  }

  /** Align the directory entry with the engine's load state. Idempotent: the
   *  load events can fire more often than the state actually flips, and every
   *  card publish re-checks so a refused swap converges on the next publish. */
  private syncProviderRow(): void {
    const entry: LlmConfigurableProvider = {
      provider: ROUTE,
      displayName: PROVIDER_NAME,
      settingsNs: this.settingsNs,
      settingsPath: [],
    }
    const visible = isLoaded()
    if (visible === this.providerRowVisible) return
    try {
      this.providerHandle?.replace(visible ? [entry] : [])
      this.providerRowVisible = visible
    } catch (error) {
      // A refused swap leaves the previous state; the next flip retries. Never
      // swallow silently: a stuck row is exactly the kind of failure that
      // must be findable in the host log.
      console.warn(`[embedding-local] provider row ${visible ? 'restore' : 'withdraw'} refused:`,
        error instanceof Error ? error.message : error)
    }
  }

  // ---- hub registration -------------------------------------------------------

  private registerHub(ctx: Context): void {
    const account = this
    const dispose = ctx.accountHub.register({
      id: ID,
      // Same string the directory row carries (see PROVIDER_NAME).
      displayName: PROVIDER_NAME,
      settingsNs: this.settingsNs,
      // The models-page provider id this account backs, and the opt-in that
      // serves the card's models-surface fields under that provider row.
      provider: ROUTE,
      modelsCard: true,
      // A non-chat capability: the hub sections the column by this type.
      type: 'embedding',
      // Direct serving: the engine runs in-process; there is no upstream and
      // no chat adapter at all.
      workMode: 'direct',
      // Rebuilt on every read: the card mirrors the engine's live state.
      get card() { return account.buildCard() },
      invoke: (method: string) => this.invoke(method),
      getState: () => this.view as unknown as JsonValue,
    })
    ctx.effect(() => dispose, 'embedding-local: hub registration')
  }

  /** The declarative card: load/unload gestures plus read-only catalog info.
   *  The model list is fixed by the plugin build — there is nothing to add or
   *  remove at runtime, so the card only reports and toggles the engine. */
  private buildCard(): AccountHubCardDescriptor {
    const models = this.service().availableModels()
    const catalogLabel = models.length === 0
      ? '插件未提供任何向量模型权重（models/ 目录为空）'
      : `插件提供 ${models.length} 个向量模型：${models.map(one => one.id).join('、')}`
    return {
      // The account column renders brand facts only (logo, name, status,
      // gesture): the weight, dims, and catalog all duplicate the title or
      // status line, and the brand row is a one-line layout that draws
      // nothing else. The models-page seat keeps the read-only notes —
      // there the editor frame carries the title, so they read as facts.
      fields: [
        {
          key: 'enable', kind: 'button', surface: 'account', when: 'signed-out',
          label: '加载向量模型', tone: 'primary', action: 'enable', busyLabel: '加载中…',
        },
        {
          key: 'disable', kind: 'button', surface: 'account', when: 'signed-in',
          label: '卸载向量模型', action: 'disable', busyLabel: '卸载中…',
        },
        {
          key: 'catalog', kind: 'note', surface: 'models',
          label: catalogLabel,
        },
        {
          key: 'usage', kind: 'note', surface: 'models',
          label: '其他插件通过 embedding 服务的 embed/similarity/listModels 方法调用；不进入对话模型列表。',
        },
      ],
    }
  }

  /** Forward one hub-card operation to its implementation. */
  private async invoke(method: string): Promise<JsonValue> {
    switch (method) {
      case 'enable': return this.enable()
      case 'disable': return this.disable()
      default: throw new Error(`未知账号操作 "${method}"`)
    }
  }

  /** Eagerly load the plugin's default weight, persisting the intent. */
  private async enable(): Promise<JsonValue> {
    const result = await this.load()
    // Persist only a successful adoption: a failed load must not restore
    // itself (and re-fail) on every boot.
    const failed = typeof result === 'object' && result !== null
      && !Array.isArray(result) && (result as { error?: unknown }).error === true
    if (!failed) this.setEnabled(true)
    return result
  }

  /** Load without touching the persisted intent (boot restore, retries). */
  private async load(): Promise<JsonValue> {
    let model: AvailableModel
    try {
      model = this.service().resolveModel()
    } catch {
      this.publish('缺少权重', 'error', false)
      return { message: '插件未提供向量模型权重（models/ 目录为空）', error: true }
    }
    this.publish('加载中…', 'warn', false, true)
    try {
      const [vector] = await this.service().embed(['warmup'])
      const dims = vector?.length ?? 0
      this.publish(`就绪（${dims} 维）`, 'ok', true)
      return { message: `向量模型已加载（${model.id}，${dims} 维）` }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.publish(`加载失败：${message}`, 'error', false)
      return { message: `加载失败：${message}`, error: true }
    }
  }

  /** Release the weight; the next embed loads it again on demand. */
  private async disable(): Promise<JsonValue> {
    this.setEnabled(false)
    await unload()
    this.publish('未加载', 'warn', false)
    return { message: '向量模型已卸载' }
  }

  // ---- persisted enable intent -----------------------------------------------

  /** Persist the enable flag through the same official settings seam every
   *  plugin configuration write uses. Fire-and-forget: the card state does
   *  not depend on the write landing, and `settings/document-updated` will
   *  re-publish when it does. */
  private setEnabled(value: boolean): void {
    void this.ctx.settings.mutate(this.settingsNs, [
      { op: 'set', path: ['enabled'], value },
    ]).catch(() => { /* retried by the next gesture */ })
  }

  /** The persisted enable intent, user layer first. */
  private readEnabled(): boolean {
    try {
      const row = this.ctx.settings.describe().find(one => one.ns === this.settingsNs)
      const user = row?.user as { enabled?: unknown } | undefined
      const value = row?.value as { enabled?: unknown } | undefined
      return user?.enabled === true || (user?.enabled === undefined && value?.enabled === true)
    } catch {
      return false
    }
  }

  /** Boot restore: a previously enabled engine reloads in the background so
   *  the models-page row (and the capability) survive a restart, the way the
   *  local chat model's persisted enable does. Fire-and-forget — activation
   *  never waits on model I/O, and the card shows the loading posture while
   *  it runs. A missing weight keeps the flag but nothing loads. */
  private restore(): void {
    if (!this.readEnabled() || !weightPresent()) return
    void this.load()
  }

  /** Compose the full view and announce it to the hub watch stream. The
   *  state is deliberately lean: the one-line brand row renders title +
   *  status + gesture, and anything more would repeat those facts. */
  private publish(
    text: string,
    level: NonNullable<AccountHubCardState['level']>,
    signedIn: boolean,
    signingIn?: boolean,
  ): void {
    this.view = {
      text,
      level,
      signedIn,
      ...(signingIn === true ? { signingIn: true } : {}),
      brand: BRAND,
    }
    // The publish sites are exactly the load-state transitions the user can
    // trigger (load gesture, unload, lazy first embed): converge the
    // models-page row here too, so a missed load event self-heals.
    this.syncProviderRow()
    this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
  }

  /** Re-read state after a settings write; the card copy tracks the catalog. */
  private refresh(): void {
    if (isLoaded()) {
      const dims = currentDimensions()
      this.publish(`就绪（${dims} 维）`, 'ok', true)
    } else {
      this.publish('未加载', 'warn', false)
    }
  }
}

/**
 * Host service backing the generated `ctx.remote.embedding` namespace: the
 * same operations the cordis service exposes, over the typert wire, so
 * browser-side tools (a script tool, a diagnostic card) can embed too. The
 * wire face lists exactly the configured catalog — nothing else is visible.
 */
export class EmbeddingController extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'embeddingController', { namespace: 'embedding' })
  }

  private service(): EmbeddingService {
    const service = this.ctx.get('embedding')
    if (service === undefined) {
      throw new RemoteError('embedding/unavailable', 'the embedding service is not mounted', {})
    }
    return service
  }

  /** Map a model-resolution or engine failure onto the wire vocabulary. */
  private fail(error: unknown): never {
    if (error instanceof ModelResolutionError) {
      if (error.kind === 'unknown-model') {
        throw new RemoteError('embedding/unknown-model', error.message, { id: error.modelId ?? '' })
      }
      throw new RemoteError('embedding/no-model', error.message, {})
    }
    throw new RemoteError('embedding/engine-failed',
      error instanceof Error ? error.message : String(error), {})
  }

  /** The configured model catalog with on-disk and loaded facts. */
  @Remote
  async models(): Promise<{ id: string; file: string; loaded: boolean }[]> {
    return this.service().listModels()
  }

  /** Embed one string or a batch against a configured model. */
  @Remote
  async create(input: string | readonly string[], modelId?: string): Promise<{
    model: string
    dims: number
    vectors: number[][]
  }> {
    const inputs = Array.isArray(input) ? [...input] : [input]
    if (inputs.length === 0 || inputs.some((one) => typeof one !== 'string')) {
      throw new RemoteError('embedding/invalid-input', 'input must be a string or a string array', {})
    }
    try {
      const target = this.service().resolveModel(modelId)
      const vectors = await this.service().embed(inputs, target.id)
      return { model: target.id, dims: vectors[0]?.length ?? 0, vectors }
    } catch (error) {
      this.fail(error)
    }
  }

  /** Cosine similarity of two vectors through the wire. */
  @Remote
  async similarity(a: readonly number[], b: readonly number[]): Promise<number> {
    return this.service().similarity(a, b)
  }

  /** Whether the weight is on disk and can load when needed. */
  @Remote
  async status(): Promise<{ ready: boolean; loaded: boolean; dims: number; models: number }> {
    const service = this.service()
    return {
      ready: service.isReady(), loaded: isLoaded(), dims: currentDimensions(),
      models: service.availableModels().length,
    }
  }
}

/** Harness-side plugin: mount the embedding service, account row, and remote face. */
export function apply(ctx: Context): void {
  ctx.plugin(EmbeddingService)
  ctx.plugin(EmbeddingAccount)
  ctx.plugin(EmbeddingController)
}
