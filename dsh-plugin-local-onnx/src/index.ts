/**
 * Local ONNX account plugin (self-contained form).
 *
 * A Qwen3-0.6B inference provider that runs entirely inside the host process,
 * declared to the hub as a `direct` account product: the adapter fabricates the
 * reply itself, so no upstream API — and no internet access — is involved.
 * Its weights and its runtime dependencies both ship inside this package
 * (`models/` and `node_modules/`), resolved at run time from
 * `import.meta.url`, so activation asks nothing of the host environment and
 * patches nothing in harness.
 *
 * Being local, there is nothing to authenticate to. The hub card's single
 * gesture — 「启用本地模型」 — stands in for a sign-in: it is what makes the
 * provider advertise models, which is also how the models page learns it
 * exists.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-llm'
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-api-account-hub'
import { ACCOUNT_HUB_CHANGED } from '@deepseek-ai/dsh-api-account-hub'
import type { AccountHubCardDescriptor, AccountHubCardState } from '@deepseek-ai/dsh-api-account-hub'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import zschema from '@deepseek-ai/schemastery'
import { generate, modelRoot, toChatMessages, warmup, weightsPresent } from './local-model.ts'

/** Stable identity: hub account id and provider route. */
export const name = 'local-onnx-account'
const ID = name
const PROVIDER = 'local-onnx'

/** The single model this provider advertises. */
const MODEL_ID = 'Qwen3-0.6B-ONNX'

/** The upstream context this model was exported with. */
const CONTEXT_WINDOW = 40_960

/**
 * The registry-topology event that tells the model selector to reload. It is
 * declared by the llm service and forwarded to the browser verbatim, so a
 * plugin may publish it without touching harness.
 */
const LLM_ADAPTERS_UPDATED = 'llm/adapters-updated'

/**
 * Plugin configuration type. Every field is `.volatile()`, so at runtime each
 * arrives as a lazy box rather than the raw value — an official plugin reads
 * them through `.get()` so a settings write lands without a fiber restart
 * race. They are also why the settings namespace exists at all: the settings
 * service projects only volatile fields, and a namespace that projects
 * nothing takes its models-page row with it.
 */
export interface Config {
  maxTokens?: { readonly get: () => number }
  temperature?: { readonly get: () => number }
}

export const Config = zschema.object({
  maxTokens: zschema.number().min(64).max(4096).step(64).default(1024).volatile(),
  temperature: zschema.number().min(0).max(2).step(0.1).default(0.7).volatile(),
})

/** The brand mark: a small "OQ" badge, inlined as a data URI. */
const LOGO_DATA_URI = 'data:image/svg+xml;base64,'
  + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">`
    + `<rect x="1" y="1" width="22" height="22" rx="6" fill="#3d5afe"/>`
    + `<text x="12" y="16.5" font-family="Helvetica, Arial, sans-serif" font-size="10"`
    + ` font-weight="700" fill="#ffffff" text-anchor="middle">OQ</text></svg>`, 'utf8').toString('base64')

const BRAND = Object.freeze({ logoUrl: LOGO_DATA_URI, name: '本地 Qwen3' })

/** The declarative card: one enable/disable gesture on the account column and
 *  a note on the models column. Nothing else — there is no credential to edit. */
const CARD: AccountHubCardDescriptor = {
  fields: [
    {
      key: 'enable', kind: 'button', surface: 'account', when: 'signed-out',
      label: '启用本地模型', tone: 'primary', action: 'enable', busyLabel: '加载中…',
    },
    {
      key: 'disable', kind: 'button', surface: 'account', when: 'signed-in',
      label: '停用本地模型', action: 'disable', busyLabel: '卸载中…',
    },
    {
      key: 'tagline', kind: 'note', surface: 'models',
      label: '本地 Qwen3-0.6B（ONNX）完全在本机运行：权重与运行时依赖都在插件包内，不联网、不需要账号。',
    },
  ],
}

/** One maybe-boxed number off the config, falling back when unset. */
function unbox(box: { readonly get: () => number } | undefined, fallback: number): number {
  const value = box?.get()
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * The local inference adapter.
 *
 * It advertises one model and, once enabled, streams a reply produced by
 * `local-model.ts`. Tool declarations are ignored rather than forwarded: this
 * model cannot call tools, and pretending otherwise would only invite a
 * malformed call.
 */
class LocalOnnxAdapter extends LlmAdapter {
  constructor(private readonly plugin: LocalOnnxAccount) {
    super()
  }

  /** @inheritDoc */
  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: '本地 Qwen3' }
  }

  /** @inheritDoc */
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    // Same visibility semantics as a signed-out account route: until enabled
    // the provider advertises nothing, so the models page drops the row.
    if (!this.plugin.isEnabled) return []
    return [{ provider, id: MODEL_ID, name: 'Qwen3-0.6B（本地）', inputModalities: ['text'] }]
  }

  /** @inheritDoc */
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return {
      provider, id: model, name: 'Qwen3-0.6B（本地）',
      context: { contextWindow: CONTEXT_WINDOW },
      defaultMaxTokens: this.plugin.maxTokens,
      inputModalities: ['text'],
    }
  }

  /** @inheritDoc */
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (!this.plugin.isEnabled) {
      throw new LlmError('本地模型未启用：请先在设置-账号中启用本地模型。', 'LOCAL_ONNX_DISABLED')
    }
    const messages = toChatMessages(options.messages, options.system)
    if (messages.length === 0) {
      throw new LlmError('没有可发送的内容：本地模型只接受文本消息。', 'LOCAL_ONNX_EMPTY_INPUT')
    }
    options.signal?.throwIfAborted()
    const result = await generate(messages, {
      maxTokens: options.maxTokens ?? this.plugin.maxTokens,
      temperature: options.temperature ?? this.plugin.temperature,
      topP: 0.9,
    }, options.signal)

    // Block bookkeeping: reasoning and answer runs are separate blocks, so a
    // transition closes the open one before a new block starts. The index is
    // the block's own and never reused.
    let nextIndex = 0
    let open: { index: number; kind: 'reasoning' | 'answer'; text: string } | undefined
    const close = (): StreamChunk | undefined => {
      if (open === undefined) return undefined
      const block = open.kind === 'reasoning'
        ? { type: 'reasoning' as const, text: open.text }
        : { type: 'text' as const, text: open.text }
      return { type: 'block-end', index: open.index, block }
    }

    for await (const piece of result.stream) {
      if (open !== undefined && open.kind !== piece.kind) {
        const ended = close()
        open = undefined
        if (ended !== undefined) yield ended
      }
      if (open === undefined) {
        const index = nextIndex
        nextIndex += 1
        open = { index, kind: piece.kind, text: '' }
        yield { type: 'block-start', index, blockType: piece.kind === 'reasoning' ? 'reasoning' : 'text' }
      }
      open.text += piece.text
      yield piece.kind === 'reasoning'
        ? { type: 'reasoning-delta', index: open.index, text: piece.text }
        : { type: 'text-delta', index: open.index, text: piece.text }
    }
    const ended = close()
    if (ended !== undefined) yield ended

    const usage = await result.done
    yield {
      type: 'usage',
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.inputTokens + usage.outputTokens,
      },
    }
    options.signal?.throwIfAborted()
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/**
 * The account service. `llm` and `accountHub` arrive through injection; there
 * is no credential service because nothing here authenticates.
 */
export default class LocalOnnxAccount extends Service {
  static inject = ['llm', 'accountHub']
  static Config = Config

  private readonly settingsNs: string
  private readonly config: Config
  private enabled = false
  /** Whether the pipeline has finished loading in this process. */
  private ready = false
  private loadFailure: string | undefined
  private view: AccountHubCardState = { text: '未启用', level: 'warn', signedIn: false, brand: BRAND }

  /** @param ctx - host context. @param config - plugin configuration. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'localOnnxAccount')
    this.settingsNs = ctx.fiber?.entry?.options.id ?? ID
    this.config = config
    this.registerProvider(ctx)
    this.registerHub(ctx)
    this.publish()
  }

  /** Whether the provider currently advertises its model. */
  get isEnabled(): boolean {
    return this.enabled
  }

  /** Output cap from config, with a sane floor if the box is empty. */
  get maxTokens(): number {
    return unbox(this.config.maxTokens, 1024)
  }

  /** Sampling temperature from config. */
  get temperature(): number {
    return unbox(this.config.temperature, 0.7)
  }

  // ---- provider registration -------------------------------------------------

  private registerProvider(ctx: Context): void {
    ctx.llm.registerConfigurableProviders([
      { provider: PROVIDER, displayName: '本地 Qwen3', settingsNs: this.settingsNs, settingsPath: [], accountProvider: true },
    ])
    ctx.llm.registerAdapter([PROVIDER], new LocalOnnxAdapter(this))
  }

  /**
   * Announce that what this provider advertises has changed.
   *
   * The model selector reloads its catalog on `llm/adapters-updated`, on a
   * settings write, and on credential changes — a local plugin has no
   * credential to write, so arming the model would otherwise leave the
   * selector showing the catalog it loaded at startup, with this group
   * missing. Publishing the same event harness itself publishes on an adapter
   * change says exactly what happened: `listModels` now answers differently.
   */
  private announceCatalogChange(): void {
    // Typed as a plain string: the event belongs to the llm service's own
    // event table, which a plugin does not widen.
    ;(this.ctx as unknown as { emit: (event: string) => void }).emit(LLM_ADAPTERS_UPDATED)
  }

  // ---- hub registration ------------------------------------------------------

  private registerHub(ctx: Context): void {
    const dispose = ctx.accountHub.register({
      id: ID,
      displayName: '本地 Qwen3 模型',
      settingsNs: this.settingsNs,
      provider: PROVIDER,
      modelsCard: true,
      // Direct production: the adapter builds its own StreamChunk stream and
      // hands it straight to harness. No credential, no HTTP.
      workMode: 'direct',
      card: CARD,
      invoke: (method: string, args: JsonValue) => this.invoke(method, args),
      getState: () => this.view as unknown as JsonValue,
    })
    ctx.effect(() => dispose, 'local-onnx-account: hub registration')
  }

  /** Forward one hub-card operation to its implementation. */
  private async invoke(method: string, _args: JsonValue): Promise<JsonValue> {
    switch (method) {
      case 'enable': return this.enable()
      case 'disable': return this.disable()
      default: throw new Error(`未知账号操作 "${method}"`)
    }
  }

  /**
   * Adopt the local model: advertise it, then load it off the request path.
   *
   * A missing download is reported instead of throwing — the card's modal is
   * the only place the user can read what to run, and nothing about it is
   * recoverable inside the process.
   */
  private async enable(): Promise<JsonValue> {
    if (!weightsPresent()) {
      return {
        message: `尚未安装权重。请在插件目录 ${modelRoot()} 执行：node scripts/fetch-model.mjs`,
        error: true,
      }
    }
    this.enabled = true
    this.ready = false
    this.loadFailure = undefined
    this.publish()
    // Only a user gesture publishes this: the invariant installed on the event
    // walks every registered provider, so firing it during plugin construction
    // — while sibling plugins may not have registered their adapters yet —
    // would fail someone else's registration.
    this.announceCatalogChange()
    void warmup().then(
      () => {
        this.ready = true
        this.publish()
      },
      (error: unknown) => {
        this.ready = false
        this.loadFailure = error instanceof Error ? error.message : String(error)
        this.publish()
      },
    )
    return { message: '已启用本地模型，正在加载权重（首次加载约数秒）。', close: true }
  }

  /** Retire the provider: the models page drops the row immediately. */
  private async disable(): Promise<JsonValue> {
    this.enabled = false
    this.ready = false
    this.loadFailure = undefined
    this.publish()
    this.announceCatalogChange()
    return { message: '已停用本地模型。', close: true }
  }

  // ---- published state -------------------------------------------------------

  /** Recompute and publish the account-card state. The status line carries
   *  what matters about a local engine: whether it is armed, whether its
   *  weights are present, and whether this process has them resident. */
  private publish(): void {
    if (!this.enabled) {
      this.view = { text: '未启用', level: 'warn', signedIn: false, brand: BRAND }
    } else if (this.loadFailure !== undefined) {
      this.view = { text: `加载失败 · ${this.loadFailure}`, level: 'error', signedIn: true, brand: BRAND }
    } else if (this.ready) {
      this.view = {
        text: `已就绪 · ${MODEL_ID}`,
        level: 'ok',
        signedIn: true,
        brand: BRAND,
        identity: { name: '本地 Qwen3', contact: `${MODEL_ID} · ONNX · 本机运行` },
      }
    } else {
      this.view = { text: '加载中…', level: 'warn', signedIn: true, brand: BRAND }
    }
    this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
  }
}
