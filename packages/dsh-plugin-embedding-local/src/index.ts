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
 * Three faces, all official mechanisms:
 * - the `embedding` cordis service: other host plugins `ctx.get('embedding')`
 *   and call `embed` / `similarity`;
 * - the `embedding` remote namespace: the same operations over the typert
 *   wire, reachable from browser-side tools the way `accountHub.list` is;
 * - the hub card: load/unload gestures, weight facts, and a probe action.
 *
 * Weights and runtime dependencies ship inside this package (`models/` and
 * `node_modules/`), resolved at run time from `import.meta.url`; activation
 * asks nothing of the host environment and patches nothing in harness.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {} from '@dsh/api-account-hub'
import { ACCOUNT_HUB_CHANGED } from '@dsh/api-account-hub'
import type { AccountHubCardDescriptor, AccountHubCardState } from '@dsh/api-account-hub'
import {
  currentDimensions, currentWeightFile, embed, isLoaded, lastFailure, loadedFile,
  ready, similarity, unload, weightPresent,
} from './local-embed.ts'

/** Stable identity: hub account id and plugin entry name. */
export const name = 'embedding-local'
const ID = name

/** Browser-safe failure vocabulary of the embedding remote face. */
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The embedding service is not mounted. */
    'embedding/unavailable': {}
    /** The request carried a non-string input. */
    'embedding/invalid-input': {}
  }
}

/** The brand mark: a small "VE" badge, inlined as a data URI. */
const LOGO_DATA_URI = 'data:image/svg+xml;base64,'
  + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">`
    + `<rect x="1" y="1" width="22" height="22" rx="6" fill="#0f6e56"/>`
    + `<text x="12" y="16.5" font-family="Helvetica, Arial, sans-serif" font-size="10"`
    + ` font-weight="700" fill="#ffffff" text-anchor="middle">VE</text></svg>`, 'utf8').toString('base64')

const BRAND = Object.freeze({ logoUrl: LOGO_DATA_URI, name: '本地向量' })

/** The declarative card: load/unload gestures plus a weight-fact note. */
function buildCard(): AccountHubCardDescriptor {
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
        key: 'usage', kind: 'note', surface: 'account',
        label: '其他插件通过 embedding 服务的 embed/similarity 方法调用；不进入对话模型列表。',
      },
    ],
  }
}

/**
 * The public embedding service. Other host plugins reach it with
 * `ctx.get('embedding')`; the lazily loading engine keeps plugin activation
 * free of any model I/O.
 */
export class EmbeddingService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'embedding')
  }

  /** Embed one batch of texts; loads the weight on first use. */
  embed(inputs: readonly string[]): Promise<number[][]> {
    return embed(inputs)
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
 * The hub-facing account service: owns the card, the published state, and
 * the card's invoke seam. `signedIn` reads as "the weight is loaded", which
 * is the local engine's analogue of a signed-in session.
 */
export class EmbeddingAccount extends Service {
  static inject = ['accountHub', 'embedding']

  private view: AccountHubCardState = {
    text: '未加载', level: 'warn', signedIn: false, brand: BRAND,
  }

  constructor(ctx: Context) {
    super(ctx, 'embeddingAccount')
    this.registerHub(ctx)
  }

  /** Whether the weight currently holds memory. */
  get isLoadedState(): boolean {
    return isLoaded()
  }

  private registerHub(ctx: Context): void {
    const dispose = ctx.accountHub.register({
      id: ID,
      displayName: '本地向量模型',
      settingsNs: ID,
      // A non-chat capability: the hub sections the column by this type.
      type: 'embedding',
      // Direct serving: the engine runs in-process; there is no upstream and
      // no chat adapter at all.
      workMode: 'direct',
      get card() { return buildCard() },
      invoke: (method: string, args: JsonValue) => this.invoke(method, args),
      getState: () => this.view as unknown as JsonValue,
    })
    ctx.effect(() => dispose, 'embedding-local: hub registration')
  }

  /** Forward one hub-card operation to its implementation. */
  private async invoke(method: string, _args: JsonValue): Promise<JsonValue> {
    switch (method) {
      case 'enable': return this.enable()
      case 'disable': return this.disable()
      case 'probe': return this.probe()
      default: throw new Error(`未知账号操作 "${method}"`)
    }
  }

  /** Eagerly load the weight so the first real embed skips the load cost. */
  private async enable(): Promise<JsonValue> {
    this.publish('加载中…', 'warn', false, true)
    try {
      const [vector] = await embed(['warmup'])
      const dims = vector?.length ?? 0
      this.publish(`就绪（${dims} 维）`, 'ok', true)
      return { message: `向量模型已加载（${dims} 维）` }
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
      const vectors = await embed(['向量模型探测'])
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
    const rows: AccountHubCardState['details'] = {
      rows: [
        { label: '权重', value: isLoaded() ? loadedFile()! : currentWeightFile() },
        ...(currentDimensions() > 0
          ? [{ label: '维度', value: String(currentDimensions()) }]
          : []),
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
}

/**
 * Host service backing the generated `ctx.remote.embedding` namespace: the
 * same operations the cordis service exposes, over the typert wire, so
 * browser-side tools (a script tool, a diagnostic card) can embed too.
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

  /** Embed one string or a batch; returns the width and the vectors. */
  @Remote
  async create(input: string | readonly string[]): Promise<{
    model: string
    dims: number
    vectors: number[][]
  }> {
    const inputs = Array.isArray(input) ? [...input] : [input]
    if (inputs.length === 0 || inputs.some((one) => typeof one !== 'string')) {
      throw new RemoteError('embedding/invalid-input', 'input must be a string or a string array', {})
    }
    const vectors = await this.service().embed(inputs)
    return { model: loadedFile() ?? currentWeightFile(), dims: vectors[0]?.length ?? 0, vectors }
  }

  /** Cosine similarity of two vectors through the wire. */
  @Remote
  async similarity(a: readonly number[], b: readonly number[]): Promise<number> {
    return this.service().similarity(a, b)
  }

  /** Whether the weight is on disk and can load when needed. */
  @Remote
  async status(): Promise<{ ready: boolean; loaded: boolean; dims: number }> {
    return { ready: this.service().isReady(), loaded: isLoaded(), dims: currentDimensions() }
  }
}

/** Harness-side plugin: mount the embedding service, account row, and remote face. */
export function apply(ctx: Context): void {
  ctx.plugin(EmbeddingService)
  ctx.plugin(EmbeddingAccount)
  ctx.plugin(EmbeddingController)
}
