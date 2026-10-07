/**
 * Local GGUF account plugin (self-contained form).
 *
 * An inference provider that runs entirely inside the host process, declared to
 * the hub as a `direct` account product: the adapter fabricates the reply
 * itself, so no upstream API — and no internet access — is involved. Its
 * weights and its runtime dependencies both ship inside this package
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
import type {} from '@dsh-private/api-account-hub'
import { ACCOUNT_HUB_CHANGED } from '@dsh-private/api-account-hub'
import type { AccountHubCardDescriptor, AccountHubCardState } from '@dsh-private/api-account-hub'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import zschema from '@deepseek-ai/schemastery'
import {
  buildToolAliases, currentModelId, generate, isXLAMModel, loadEnabled, normalizeToolArgs,
  parseToolCalls, resetModelSelection, resolveBarePaths, saveEnabled, toChatMessages, warmup,
  weightsPresent,
  type ToolAliasSet, type ToolSpec,
} from './local-model.ts'
import { downloadWeights } from './fetch-weights.ts'

/** Stable identity: hub account id and provider route. */
export const name = 'local-llama-account'
const ID = name
const PROVIDER = 'local-llama'

/** The upstream context this model carries. */
const CONTEXT_WINDOW = 40_960

/**
 * The registry-topology event that tells the model selector to reload. It is
 * declared by the llm service and forwarded to the browser verbatim, so a
 * plugin may publish it without touching harness.
 */
const LLM_ADAPTERS_UPDATED = 'llm/adapters-updated'

/**
 * Human-readable brand marks, chosen per loaded weight. xLAM is the
 * function-calling model; Qwen3-0.6B is the general chat fallback.
 */
function isXlam(): boolean {
  return isXLAMModel()
}
function brandName(): string {
  return isXlam() ? '本地 xLAM' : '本地 Qwen3'
}
function modelDisplayName(): string {
  return isXlam() ? 'xLAM-2-3B（本地/工具调用）' : 'Qwen3-0.6B（本地）'
}
function tagline(): string {
  return isXlam()
    ? '本地 xLAM-2-3B（GGUF）完全在本机运行：权重与运行时依赖都在插件包内，不联网、不需要账号。专为函数调用训练，可在 harness 内触发技能/工具。'
    : '本地 Qwen3-0.6B（GGUF）完全在本机运行：权重与运行时依赖都在插件包内，不联网、不需要账号。'
}

/** The brand mark: a small "OQ" badge, inlined as a data URI. */
const LOGO_DATA_URI = 'data:image/svg+xml;base64,'
  + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">`
    + `<rect x="1" y="1" width="22" height="22" rx="6" fill="#3d5afe"/>`
    + `<text x="12" y="16.5" font-family="Helvetica, Arial, sans-serif" font-size="10"`
    + ` font-weight="700" fill="#ffffff" text-anchor="middle">OQ</text></svg>`, 'utf8').toString('base64')

const BRAND = Object.freeze({ logoUrl: LOGO_DATA_URI, name: brandName() })

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
      label: tagline(),
    },
  ],
}

/** One maybe-boxed number off the config, falling back when unset. */
function unbox(box: { readonly get: () => number } | undefined, fallback: number): number {
  const value = box?.get()
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Map a model-emitted tool name onto a real harness tool name.
 *
 * xLAM may emit a familiar generic name (e.g. `cat`, `read_file`, `shell`)
 * from its training data instead of the exact name we injected. Try an exact
 * match first, then a small intent-alias table keyed by the model's likely
 * vocabulary, then a substring fallback. Whatever is returned is what harness
 * will route on — if nothing matches we keep the raw name so the failure stays
 * visible (`unknown tool`) rather than silently mis-routing.
 */
function normalizeToolName(raw: string, tools: readonly ToolSpec[]): string {
  const target = raw.trim()
  if (target.length === 0 || tools.length === 0) return raw
  const lower = target.toLowerCase()

  const exact = tools.find((tool) => tool.name.toLowerCase() === lower)
  if (exact) return exact.name

  // model-side name -> intent bucket
  const INTENT: Record<string, string> = {
    cat: 'read', read: 'read', read_file: 'read', readfile: 'read', file_read: 'read',
    view: 'read', view_file: 'read', type: 'read', show: 'read', show_file: 'read',
    open: 'read', open_file: 'read', get_file: 'read', load_file: 'read',
    write: 'write', write_file: 'write', edit: 'write', edit_file: 'write',
    modify: 'write', create_file: 'write', update_file: 'write', patch: 'write',
    exec: 'exec', execute: 'exec', run: 'exec', run_command: 'exec',
    shell: 'exec', bash: 'exec', terminal: 'exec', command: 'exec', cmd: 'exec',
    browse: 'browser', browser: 'browser', navigate: 'browser', click: 'browser',
    web: 'browser', goto: 'browser', open_url: 'browser', scrape: 'browser',
    doc: 'doc', docx: 'doc', ppt: 'doc', pptx: 'doc', xlsx: 'doc',
    excel: 'doc', word: 'doc', powerpoint: 'doc', spreadsheet: 'doc',
    search: 'search', grep: 'search', find: 'search', locate: 'search', lookup: 'search',
    plan: 'plan', planner: 'plan', boundary: 'plan',
    react: 'react', best_practices: 'react',
  }
  // intent bucket -> keywords that identify a real harness tool
  const KEYWORDS: Record<string, string[]> = {
    read: ['读', 'read'],
    write: ['改', 'write', 'edit'],
    exec: ['执行', 'exec', 'run', 'shell'],
    browser: ['浏览器', 'browser', 'web'],
    doc: ['文档', 'doc', 'office'],
    search: ['读', 'search', 'grep', 'find'],
    plan: ['规划', 'boundary', 'feature'],
    react: ['react', 'vercel'],
  }
  const bucket = INTENT[lower]
  if (bucket) {
    const keywords = KEYWORDS[bucket]!
    const hit = tools.find((tool) =>
      keywords.some((kw) => tool.name.toLowerCase().includes(kw.toLowerCase())))
    if (hit) return hit.name
  }

  const sub = tools.find(
    (tool) => lower.includes(tool.name.toLowerCase()) || tool.name.toLowerCase().includes(lower))
  if (sub) return sub.name
  return raw
}

/**
 * The local inference adapter.
 *
 * It advertises one model and, once enabled, streams a reply produced by
 * `local-model.ts`. For the xLAM weight, tool declarations are forwarded into
 * the model's prompt and its JSON-array replies are surfaced as `tool-call`
 * chunks, so harness's own skill/tool loop can take over. A plain chat weight
 * (Qwen3-0.6B) ignores tools.
 */
class LocalLlamaAdapter extends LlmAdapter {
  constructor(private readonly plugin: LocalLlamaAccount) {
    super()
  }

  /** @inheritDoc */
  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: brandName() }
  }

  /** @inheritDoc */
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    // Same visibility semantics as a signed-out account route: until enabled
    // the provider advertises nothing, so the models page drops the row.
    if (!this.plugin.isEnabled) return []
    return [{ provider, id: currentModelId(), name: modelDisplayName(), inputModalities: ['text'] }]
  }

  /** @inheritDoc */
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return {
      provider, id: model, name: modelDisplayName(),
      context: { contextWindow: CONTEXT_WINDOW },
      defaultMaxTokens: this.plugin.maxTokens,
      inputModalities: ['text'],
    }
  }

  /** @inheritDoc */
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (!this.plugin.isEnabled) {
      throw new LlmError('本地模型未启用：请先在设置-账号中启用本地模型。', 'LOCAL_LLAMA_DISABLED')
    }
    // Only the xLAM weight understands tools; a plain chat model is given none.
    const tools: readonly ToolSpec[] | undefined = isXlam()
      ? (options.tools as readonly ToolSpec[] | undefined)
      : undefined
    // Present tools to xLAM under short aliases (fn0/p0) so it stops inventing
    // English shell names like "cat"/"cd"; the alias set maps them back to the
    // real harness names at resolution time.
    const aliases: ToolAliasSet | undefined = tools !== undefined ? buildToolAliases(tools) : undefined
    const messages = toChatMessages(options.messages, options.system, aliases)
    if (messages.length === 0) {
      throw new LlmError('没有可发送的内容：本地模型只接受文本消息。', 'LOCAL_LLAMA_EMPTY_INPUT')
    }
    options.signal?.throwIfAborted()

    const result = await generate(
      options.messages, options.system, aliases,
      {
        maxTokens: options.maxTokens ?? this.plugin.maxTokens,
        temperature: options.temperature ?? this.plugin.temperature,
        topP: 0.9,
      },
      options.signal,
    )

    // xLAM answers tool requests as a JSON array of {name, arguments}. When one
    // is present, emit it as tool-call chunks so harness keeps looping.
    if (isXlam()) {
      const [fullText, usage] = await Promise.all([result.fullText, result.done])
      const calls = parseToolCalls(fullText)
      if (calls !== undefined && calls.length > 0) {
        const preamble = fullText.slice(0, fullText.indexOf('[')).trim()
        let index = 0
        if (preamble.length > 0) {
          yield { type: 'block-start', index, blockType: 'text' }
          yield { type: 'text-delta', index, text: preamble }
          yield { type: 'block-end', index, block: { type: 'text', text: preamble } }
          index += 1
        }
        for (const call of calls) {
          const resolvedName = aliases !== undefined
            ? aliases.fnToReal.get(call.name) ?? normalizeToolName(call.name, tools ?? [])
            : normalizeToolName(call.name, tools ?? [])
          const spec = (tools ?? []).find((tool) => tool.name === resolvedName)
          const args = spec !== undefined
            ? resolveBarePaths(normalizeToolArgs(call.arguments, spec, aliases))
            : call.arguments
          yield {
            type: 'tool-call-delta',
            index,
            id: `local-llama-${index}`,
            name: resolvedName,
            argumentsDelta: JSON.stringify(args ?? {}),
            // StreamChunk types `id` as a branded ToolCallId; the assembler
            // tolerates a plain string and falls back to `call-${index}`.
          } as unknown as StreamChunk
          index += 1
        }
        yield {
          type: 'usage',
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.inputTokens + usage.outputTokens,
          },
        }
        options.signal?.throwIfAborted()
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
        return
      }
      // No tool call recognized: stream the text reply as usual.
      yield * streamReply(result, usage, options)
      return
    }

    // Plain chat weight: stream the text reply.
    const usage = await result.done
    yield * streamReply(result, usage, options)
  }
}

/**
 * Forward the engine's streaming pieces as text/reasoning blocks, then the
 * usage and a stop finish. Factored out so both the tool-call and plain paths
 * share it.
 */
async function *streamReply(
  result: Awaited<ReturnType<typeof generate>>,
  usage: { inputTokens: number; outputTokens: number },
  options: GenerateOptions,
): AsyncIterable<StreamChunk> {
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

/**
 * Display value of the read-only model field: the id the engine will load, or
 * a placeholder while no weight is on disk yet. Evaluated when the schema is
 * built — at module load, and again after each in-app download via
 * `refreshSettingsSchema` — which covers exactly the moments the engine could
 * pick a different weight.
 */
function modelDisplayValue(): string {
  return weightsPresent() ? currentModelId() : '未下载权重'
}

/**
 * Plugin configuration type. Every scalar field is `.volatile()`, so at
 * runtime each arrives as a lazy box rather than the raw value — an official
 * plugin reads them through `.get()` so a settings write lands without a
 * fiber restart race. They are also why the settings namespace exists at all:
 * the settings service projects only volatile fields, and a namespace that
 * projects nothing takes its models-page row with it. `model` carries no
 * service state; it is a read-only mirror of the engine's weight choice.
 */
export interface Config {
  model?: { readonly get: () => string }
  maxTokens?: { readonly get: () => number }
  temperature?: { readonly get: () => number }
}

/**
 * Build the settings schema. `model` is `.disabled()`: the settings page
 * renders it as a grayed, non-editable input mirroring `currentModelId()`.
 * Every field stays volatile — the settings write path rejects any
 * non-volatile scalar ("Config field is not volatile"), so a display-only
 * field must still be volatile to keep the rest of the form savable.
 */
function buildConfig() {
  return zschema.object({
    model: zschema.string()
      .default(modelDisplayValue())
      .description('实际加载的本地模型（按 models/ 目录自动选择，不可修改）')
      .disabled()
      .volatile(),
    maxTokens: zschema.number().min(64).max(4096).step(64).default(1024).volatile(),
    temperature: zschema.number().min(0).max(2).step(0.1).default(0.7).volatile(),
  })
}

export const Config = buildConfig()

/**
 * The account service. `llm` and `accountHub` arrive through injection; there
 * is no credential service because nothing here authenticates.
 */
export default class LocalLlamaAccount extends Service {
  static inject = ['llm', 'accountHub']
  static Config = Config

  private readonly settingsNs: string
  private readonly config: Config
  private enabled = false
  /** Whether the pipeline has finished loading in this process. */
  private ready = false
  private loadFailure: string | undefined
  /** Progress line of an in-flight weight download, undefined when idle. */
  private downloadProgress: string | undefined
  /** Why the last weight download failed, undefined otherwise. */
  private downloadError: string | undefined
  /** Aborts the in-flight download when the user disables mid-fetch. */
  private downloadAbort: AbortController | undefined
  private view: AccountHubCardState = { text: '未启用', level: 'warn', signedIn: false, brand: BRAND }

  /** @param ctx - host context. @param config - plugin configuration. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'localLlamaAccount')
    this.settingsNs = ctx.fiber?.entry?.options.id ?? ID
    this.config = config
    this.registerProvider(ctx)
    this.registerHub(ctx)
    this.restore()
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
      { provider: PROVIDER, displayName: brandName(), settingsNs: this.settingsNs, settingsPath: [], accountProvider: true },
    ])
    ctx.llm.registerAdapter([PROVIDER], new LocalLlamaAdapter(this))
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
      displayName: '本地模型',
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
    ctx.effect(() => dispose, 'local-llama-account: hub registration')
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
   * Restore the persisted enabled flag after a restart. The in-memory `enabled`
   * field is always false at construction, so without this the account would
   * forget it was enabled the previous run. A missing download is treated as
   * "not enabled" and the stale record is cleared.
   */
  private restore(): void {
    if (!loadEnabled()) {
      this.publish()
      return
    }
    if (!weightsPresent()) {
      saveEnabled(false)
      this.publish()
      return
    }
    // Defer the catalog announcement past plugin construction so every sibling
    // adapter is registered before the llm service walks the provider list.
    this.arm(false)
  }

  /**
   * Adopt the local model: advertise it, then load it off the request path.
   *
   * When no weight has been downloaded yet, enabling becomes the fetch
   * trigger: the download starts in the background, the card reads 「下载中…」
   * until it lands, and the engine arms itself right after — one gesture, no
   * terminal visit.
   */
  private async enable(): Promise<JsonValue> {
    if (this.downloadAbort !== undefined) {
      return {
        message: `权重正在下载中：${this.downloadProgress ?? '准备中…'}。完成后将自动启用。`,
        close: true,
      }
    }
    if (!weightsPresent()) {
      this.startDownload()
      return {
        message: '本地未找到权重，已开始自动下载 xLAM-2-3B-fc-r（约 1.93 GB，卡片区可见进度）。下载完成后将自动启用。',
        close: true,
      }
    }
    this.arm()
    saveEnabled(true)
    return { message: '已启用本地模型，正在加载权重（首次加载约数秒）。', close: true }
  }

  /** Retire the provider: the models page drops the row immediately. A download
   *  in flight is aborted — a disabled account should not keep pulling GBs. */
  private async disable(): Promise<JsonValue> {
    this.downloadAbort?.abort()
    this.downloadAbort = undefined
    this.downloadProgress = undefined
    this.downloadError = undefined
    this.disarm()
    saveEnabled(false)
    return { message: '已停用本地模型。', close: true }
  }

  /**
   * Kick off the background weight download. While it runs the card shows the
   * progress line; on success the selection cache is dropped (it remembers the
   * "nothing downloaded" scan), the flag persists and the engine arms. A
   * failure lands on the card as a retryable error, leaving the account
   * disabled so the next 「启用」 starts a fresh download.
   */
  private startDownload(): void {
    const controller = new AbortController()
    this.downloadAbort = controller
    this.downloadProgress = '准备中…'
    this.downloadError = undefined
    this.publish()
    void downloadWeights((text) => {
      this.downloadProgress = text
      this.publish()
    }, controller.signal).then(
      () => {
        this.downloadAbort = undefined
        this.downloadProgress = undefined
        // The user disabled mid-download and the fetch raced to completion:
        // stay retired instead of arming a disabled account.
        if (controller.signal.aborted) {
          this.publish()
          return
        }
        resetModelSelection()
        this.refreshSettingsSchema()
        saveEnabled(true)
        this.arm()
      },
      (error: unknown) => {
        this.downloadAbort = undefined
        this.downloadProgress = undefined
        if (controller.signal.aborted) {
          this.publish()
          return
        }
        this.downloadError = error instanceof Error ? error.message : String(error)
        this.publish()
      },
    )
  }

  /**
   * Swap the registered config schema for a freshly built copy so the
   * read-only model field mirrors the weight that just landed without
   * waiting for a plugin reload. Cordis snapshots `plugin.Config` into the
   * runtime record once at registration; the record property is mutable, and
   * the settings service re-reads `fiber.runtime.Config` on every describe,
   * so the new default reaches the settings page immediately.
   */
  private refreshSettingsSchema(): void {
    const runtime = this.ctx.fiber?.runtime
    if (runtime !== null && runtime !== undefined) runtime.Config = buildConfig()
  }

  /**
   * Transition into the enabled state and persist nothing (caller decides).
   * `immediateAnnounce` should be false only when called during construction,
   * so the catalog-change event fires after sibling adapters have registered.
   */
  private arm(immediateAnnounce = true): void {
    this.enabled = true
    this.ready = false
    this.loadFailure = undefined
    this.publish()
    // Only a user gesture publishes this immediately: the invariant installed on
    // the event walks every registered provider, so firing it during plugin
    // construction — while sibling plugins may not have registered their
    // adapters yet — would fail someone else's registration.
    if (immediateAnnounce) this.announceCatalogChange()
    else setTimeout(() => this.announceCatalogChange(), 0)
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
  }

  /** Transition into the disabled state. */
  private disarm(): void {
    this.enabled = false
    this.ready = false
    this.loadFailure = undefined
    this.downloadError = undefined
    this.publish()
    this.announceCatalogChange()
  }

  // ---- published state -------------------------------------------------------

  /** Recompute and publish the account-card state. The status line carries
   *  what matters about a local engine: whether it is armed, whether its
   *  weights are present, and whether this process has them resident. */
  private publish(): void {
    if (this.downloadProgress !== undefined) {
      this.view = { text: `下载中… ${this.downloadProgress}`, level: 'warn', signedIn: false, brand: BRAND }
    } else if (this.downloadError !== undefined) {
      this.view = { text: `下载失败 · ${this.downloadError}`, level: 'error', signedIn: false, brand: BRAND }
    } else if (!this.enabled) {
      this.view = { text: '未启用', level: 'warn', signedIn: false, brand: BRAND }
    } else if (this.loadFailure !== undefined) {
      this.view = { text: `加载失败 · ${this.loadFailure}`, level: 'error', signedIn: true, brand: BRAND }
    } else if (this.ready) {
      this.view = {
        text: `已就绪 · ${currentModelId()}`,
        level: 'ok',
        signedIn: true,
        brand: BRAND,
        identity: { name: brandName(), contact: `${currentModelId()} · GGUF · 本机运行` },
      }
    } else {
      this.view = { text: '加载中…', level: 'warn', signedIn: true, brand: BRAND }
    }
    this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
  }
}
