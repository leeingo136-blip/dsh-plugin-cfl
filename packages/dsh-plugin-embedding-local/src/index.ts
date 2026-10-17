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
 * - the hub card: load/unload gestures and a probe action in the account
 *   column; model add/remove on the models page.
 *
 * Weights and runtime dependencies ship inside this package (`models/` and
 * `node_modules/`), resolved at run time from `import.meta.url`; activation
 * asks nothing of the host environment and patches nothing in harness.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-llm'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {} from '@dsh/api-account-hub'
import { ACCOUNT_HUB_CHANGED } from '@dsh/api-account-hub'
import type {
  AccountHubCardDescriptor, AccountHubCardState, AccountHubSelectOption,
} from '@dsh/api-account-hub'
import zschema from '@deepseek-ai/schemastery'
import {
  currentDimensions, currentWeightFile, embed, isLoaded, lastFailure,
  listWeightFiles, loadedFile, ready, selectWeight, similarity, unload,
  weightPresent,
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

/** The brand mark: a small "VE" badge, inlined as a data URI. */
const LOGO_DATA_URI = 'data:image/svg+xml;base64,'
  + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">`
    + `<rect x="1" y="1" width="22" height="22" rx="6" fill="#0f6e56"/>`
    + `<text x="12" y="16.5" font-family="Helvetica, Arial, sans-serif" font-size="10"`
    + ` font-weight="700" fill="#ffffff" text-anchor="middle">VE</text></svg>`, 'utf8').toString('base64')

const BRAND = Object.freeze({ logoUrl: LOGO_DATA_URI, name: '本地向量' })

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
  available?: VolatileBox<AvailableModel[]>
}

/** The schema class instance type, nameable without dragging cosmokit into
 *  the declaration surface (any raw `object()` inference is not — its type
 *  intersects cosmokit's `Dict`). */
type SchemaNode = InstanceType<typeof zschema>

/**
 * The configuration schema. `available` is the whole model catalog callers
 * can see; the models-page card writes it, nothing else does. Volatile keeps
 * the settings projection (and therefore the namespace) alive.
 */
export const Config = zschema.object({
  available: zschema.array(
    zschema.object({
      id: zschema.string().required().description('对外暴露的模型 ID'),
      file: zschema.string().required().description('models/ 目录下的权重文件名'),
    }),
  ).volatile().description('对其他插件可见的向量模型列表'),
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
 * free of any model I/O. The configured catalog is read from the settings
 * service on every document update — the models-page card is the only
 * writer, so the configured set here is exactly what the user chose.
 */
export class EmbeddingService extends Service {
  static inject = ['settings']

  private readonly namespace: string
  private available: AvailableModel[] = []

  constructor(ctx: Context) {
    super(ctx, 'embedding')
    this.namespace = ctx.fiber?.entry?.options.id ?? ID
    ctx.on('settings/document-updated', (ns: string) => {
      if (ns !== this.namespace) return
      this.ingest()
    })
    this.ingest()
  }

  /** Re-read the configured catalog from the settings document. */
  private ingest(): void {
    try {
      const descriptor = this.ctx.settings.describe().find(row => row.ns === this.namespace)
      const user: unknown = descriptor?.user
      const value = typeof user === 'object' && user !== null
        ? (user as { available?: unknown }).available
        : undefined
      this.available = Array.isArray(value)
        ? value.flatMap(row => {
          if (typeof row !== 'object' || row === null) return []
          const { id, file } = row as { id?: unknown; file?: unknown }
          return typeof id === 'string' && typeof file === 'string' ? [{ id, file }] : []
        })
        : []
    } catch {
      this.available = []
    }
  }

  /** The raw configured catalog, re-read so a settings write lands without
   *  depending on event delivery. */
  availableModels(): readonly AvailableModel[] {
    this.ingest()
    return this.available
  }

  /** The configured models a caller may see, with on-disk/loaded facts. */
  listModels(): { id: string; file: string; loaded: boolean }[] {
    const resident = loadedFile()
    return this.available
      .filter(row => selectWeight(row.file) !== undefined)
      .map(row => ({ id: row.id, file: row.file, loaded: resident === row.file }))
  }

  /** Resolve a caller-named model (or the first configured) to a weight file. */
  resolveModel(modelId?: string): AvailableModel {
    if (this.available.length === 0) {
      throw new ModelResolutionError('no-model', '未配置任何向量模型；请在 设置-模型 的本地向量卡片中添加。')
    }
    if (modelId === undefined) return this.available[0]!
    const row = this.available.find(one => one.id === modelId)
    if (row === undefined) {
      throw new ModelResolutionError('unknown-model', `未配置的向量模型 "${modelId}"`, modelId)
    }
    return row
  }

  /** Embed one batch of texts against a configured model. */
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
  }

  private service(): EmbeddingService {
    return this.ctx.get('embedding') as EmbeddingService
  }

  // ---- models-page provider registration -------------------------------------

  /**
   * The models-page provider route. No adapter is ever registered for it, so
   * nothing here enters the chat model catalog — the route exists only to
   * give the models page a row whose editor hosts this account's card (the
   * hub's `modelsCard` seat). A plain declared route is always visible and
   * carries no key badge: the namespace has no `apiKeyEnv`, and an empty
   * `settingsPath` reads as configured.
   */
  private registerProvider(ctx: Context): void {
    ctx.llm.registerConfigurableProviders([{
      provider: ROUTE,
      displayName: BRAND.name,
      settingsNs: this.settingsNs,
      settingsPath: [],
    }])
  }

  // ---- hub registration -------------------------------------------------------

  private registerHub(ctx: Context): void {
    const account = this
    const dispose = ctx.accountHub.register({
      id: ID,
      displayName: '本地向量模型',
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
      // Rebuilt on every read: the models-page card mirrors the configured
      // catalog and the weights on disk, both of which change live.
      get card() { return account.buildCard() },
      invoke: (method: string, args: JsonValue) => this.invoke(method, args),
      getState: () => this.view as unknown as JsonValue,
    })
    ctx.effect(() => dispose, 'embedding-local: hub registration')
  }

  /** The declarative card: account gestures plus the models-page catalog editor. */
  private buildCard(): AccountHubCardDescriptor {
    const models = this.service().availableModels()
    const files = listWeightFiles()
    const file = isLoaded() ? loadedFile()! : currentWeightFile()
    const dims = currentDimensions()
    return {
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
          key: 'probe', kind: 'button', surface: 'account',
          label: '探测', action: 'probe', busyLabel: '探测中…',
        },
        {
          key: 'weight', kind: 'note', surface: 'account',
          label: `当前权重：${file}${dims > 0 ? `（${dims} 维）` : ''}`,
        },
        {
          key: 'catalog', kind: 'note', surface: 'models',
          label: models.length === 0
            ? '尚未配置模型：调用方看不到任何向量模型'
            : `已配置 ${models.length} 个模型：${models.map(one => one.id).join('、')}`,
        },
        {
          key: 'addModel', kind: 'dialog', surface: 'models',
          label: '添加模型', busyLabel: '写入中…',
          dialog: {
            title: '添加向量模型',
            submitLabel: '添加',
            fields: [
              {
                key: 'modelId', kind: 'text', label: '模型 ID',
                placeholder: '调用方使用的名字，如 bge-small-zh-v1.5',
              },
              {
                key: 'file', kind: 'select', label: '权重文件',
                ...(files.length > 0
                  ? { options: files.map(one => ({ value: one, label: one }) satisfies AccountHubSelectOption) }
                  : {}),
              },
            ],
          },
          description: '只有这里配置的模型，才会出现在调用 embedding 的插件面前。',
        },
        {
          key: 'removeModel', kind: 'dialog', surface: 'models',
          label: '移除模型', busyLabel: '写入中…',
          dialog: {
            title: '移除向量模型',
            submitLabel: '移除',
            fields: [
              {
                key: 'modelId', kind: 'select', label: '模型',
                options: models.map(one => ({
                  value: one.id, label: `${one.id}（${one.file}）`,
                }) satisfies AccountHubSelectOption),
              },
            ],
          },
        },
        {
          key: 'usage', kind: 'note', surface: 'account',
          label: '其他插件通过 embedding 服务的 embed/similarity/listModels 方法调用；不进入对话模型列表。',
        },
      ],
    }
  }

  /** Forward one hub-card operation to its implementation. Dialog submits
   *  arrive as `{ values: { …card values, …dialog inputs } }`. */
  private async invoke(method: string, args: JsonValue): Promise<JsonValue> {
    switch (method) {
      case 'enable': return this.enable()
      case 'disable': return this.disable()
      case 'probe': return this.probe()
      case 'add-model': return this.addModel(args)
      case 'remove-model': return this.removeModel(args)
      default: throw new Error(`未知账号操作 "${method}"`)
    }
  }

  /** Card values of a dialog submit, as a loose record. */
  private dialogValues(args: JsonValue): Record<string, unknown> {
    if (typeof args !== 'object' || args === null) return {}
    const values = (args as unknown as { values?: unknown }).values
    return typeof values === 'object' && values !== null
      ? values as Record<string, unknown>
      : {}
  }

  /** Append one model to the configured catalog (the settings service writes). */
  private async addModel(args: JsonValue): Promise<JsonValue> {
    const values = this.dialogValues(args)
    const id = typeof values.modelId === 'string' ? values.modelId.trim() : ''
    const file = typeof values.file === 'string' ? values.file : ''
    if (id.length === 0) return { message: '模型 ID 不能为空', error: true }
    if (!listWeightFiles().includes(file)) {
      return { message: `权重文件不存在：${file || '（未选择）'}`, error: true }
    }
    const current = [...this.service().availableModels()]
    if (current.some(one => one.id === id)) {
      return { message: `模型 ID 已存在：${id}`, error: true }
    }
    await this.ctx.settings.mutate(this.settingsNs, [{
      op: 'set', path: ['available'], value: [...current, { id, file }],
    }])
    this.refresh()
    return { message: `已添加 ${id}`, close: true }
  }

  /** Drop one model from the configured catalog. */
  private async removeModel(args: JsonValue): Promise<JsonValue> {
    const values = this.dialogValues(args)
    const id = typeof values.modelId === 'string' ? values.modelId : ''
    const current = [...this.service().availableModels()]
    if (!current.some(one => one.id === id)) {
      return { message: `未配置的模型：${id || '（未选择）'}`, error: true }
    }
    await this.ctx.settings.mutate(this.settingsNs, [{
      op: 'set', path: ['available'], value: current.filter(one => one.id !== id),
    }])
    this.refresh()
    return { message: `已移除 ${id}`, close: true }
  }

  /** Eagerly load the first configured model's weight. */
  private async enable(): Promise<JsonValue> {
    let model: AvailableModel
    try {
      model = this.service().resolveModel()
    } catch {
      this.publish('未配置模型', 'warn', false)
      return { message: '尚未配置模型：请在 设置-模型 的本地向量卡片中添加', error: true }
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
    await unload()
    this.publish('未加载', 'warn', false)
    return { message: '向量模型已卸载' }
  }

  /** One real embed round-trip; reports dimensions and latency. */
  private async probe(): Promise<JsonValue> {
    if (!weightPresent()) {
      const message = `本地未找到权重文件（${currentWeightFile()}）。请在插件目录执行：node scripts/fetch-model.mjs`
      this.publish('缺少权重', 'error', false)
      return { message, error: true }
    }
    const started = Date.now()
    try {
      const vectors = await this.service().embed(['向量模型探测'])
      const dims = vectors[0]?.length ?? 0
      const elapsed = Date.now() - started
      this.publish(`就绪（${dims} 维）`, 'ok', true)
      return { message: `探测成功：${dims} 维，${elapsed} ms` }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.publish(`探测失败：${message}`, 'error', isLoaded())
      return { message: `探测失败：${message}`, error: true }
    }
  }

  /** Compose the full view and announce it to the hub watch stream. */
  private publish(
    text: string,
    level: NonNullable<AccountHubCardState['level']>,
    signedIn: boolean,
    signingIn?: boolean,
  ): void {
    const models = this.service().availableModels()
    const rows: AccountHubCardState['details'] = {
      rows: [
        { label: '权重', value: isLoaded() ? loadedFile()! : currentWeightFile() },
        ...(currentDimensions() > 0
          ? [{ label: '维度', value: String(currentDimensions()) }]
          : []),
        {
          label: '已配置模型',
          value: models.length === 0 ? '无' : models.map(one => one.id).join('、'),
        },
        ...(lastFailure() !== undefined && !isLoaded()
          ? [{ label: '最近错误', value: lastFailure()! }]
          : []),
      ],
    }
    this.view = {
      text,
      level,
      signedIn,
      ...(signingIn === true ? { signingIn: true } : {}),
      brand: BRAND,
      details: rows,
    }
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
