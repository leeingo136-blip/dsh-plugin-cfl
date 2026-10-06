/**
 * The local ONNX runtime: one lazily created text-generation pipeline backed
 * by this package's own vendored weights, plus the bridge that turns its
 * callback-shaped token stream into an async iterable the adapter can yield.
 *
 * Everything resolves from `import.meta.url` rather than the process cwd —
 * the host never runs with this package as its working directory, so any
 * relative path here would silently point somewhere else. Remote loading is
 * switched off outright: this plugin is meant to work with no network. The
 * transformers.js module is imported dynamically so that merely activating the
 * plugin never pays for the ONNX runtime's own load.
 */
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Model repository id, exactly matching the directory name under `models/`. */
const MODEL_ID = 'onnx-community/Qwen3-0.6B-ONNX'

/**
 * The precision actually loaded. `int8` is the default because every backend
 * exercises it well and it degrades less than 4-bit does; `q4f16` is smaller
 * but leans on fp16 arithmetic some CPU paths handle poorly. Must agree with
 * what `scripts/fetch-model.mjs` downloaded.
 */
const DTYPE = 'int8'

/** Fallback precisions tried in order when `DTYPE`'s weights are absent. */
const DTYPE_FALLBACKS = ['q4f16', 'q4', 'fp16'] as const

/** This package's root, computed from the compiled module's own location. */
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Where the vendored weights live. */
const MODEL_ROOT = join(PACKAGE_ROOT, 'models')

/** Scratch space for ORT's own file cache; absolute, since cwd is undefined here. */
const CACHE_DIR = join(PACKAGE_ROOT, '.cache')

/**
 * Hard cap on how much conversation text is fed to the model. The KV cache is
 * allocated per request and nothing else here bounds it, so an oversized
 * history would fail inside ORT rather than degrade — trimming the oldest
 * turns is both cheaper and predictable.
 */
const INPUT_CHAR_CAP = 16_000

/** A chat message as transformers.js consumes it. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** One token-ish delta handed to the caller, tagged with what it contains. */
export interface EmittedPiece {
  /** 'reasoning' while inside a `<think>` block, 'answer' otherwise. */
  kind: 'reasoning' | 'answer'
  text: string
}

/** Counts reported after a completed generation. */
export interface UsageCount {
  inputTokens: number
  outputTokens: number
}

/** The whole generation result. */
export interface GenerationResult {
  /** Streaming pieces; already split out of any reasoning block. */
  stream: AsyncIterable<EmittedPiece>
  /** Resolves once generation ends, carrying token counts. */
  done: Promise<UsageCount>
}

/**
 * The narrow shape actually used from a loaded pipeline. Declared locally so
 * union-typed upstream generics never have to be threaded through here.
 */
interface LoadedPipeline {
  tokenizer: { encode: (text: string) => unknown }
  (messages: readonly ChatMessage[], options: Record<string, unknown>): Promise<unknown>
}

/** Streamer constructor shape, narrowed for the same reason. */
type StreamerConstructor = new (tokenizer: unknown, options: Record<string, unknown>) => unknown

/** The parts of the vendored module this file needs. */
interface TransformersModule {
  env: Record<string, unknown>
  pipeline: (task: string, model: string, options: Record<string, unknown>) => Promise<unknown>
  TextStreamer: StreamerConstructor
}

/** True once `models/<id>/onnx` holds a usable weight file. */
export function weightsPresent(): boolean {
  return resolveDtype() !== undefined
}

/** The directory holding the vendored weights. */
export function modelRoot(): string {
  return MODEL_ROOT
}

/** Pick the first precision whose weight file actually exists on disk. */
function resolveDtype(): string | undefined {
  const onnxDir = join(MODEL_ROOT, MODEL_ID, 'onnx')
  return [DTYPE, ...DTYPE_FALLBACKS].find(candidate => existsSync(join(onnxDir, `model_${candidate}.onnx`)))
}

/** The error raised when nothing was downloaded yet. */
function missingWeights(): Error {
  return new Error(
    `本地未找到 ${MODEL_ID} 的 ONNX 权重。请在插件目录执行：node scripts/fetch-model.mjs --dtype ${DTYPE}`
    + `（可用精度：${[DTYPE, ...DTYPE_FALLBACKS].join(' / ')}）`,
  )
}

/**
 * Load the pipeline eagerly, off the request path.
 *
 * The first `generate()` would do this anyway, but doing it here lets a caller
 * absorb a multi-second load while showing progress — and lets a missing or
 * broken download surface as a card state instead of a failed first turn.
 */
export function warmup(): Promise<void> {
  return queued(async () => {
    await pipelineSingleton()
  })
}

/** The lazily loaded module, or undefined until the first request. */
let pendingModule: Promise<TransformersModule> | undefined

/** Load the vendored module once; concurrent callers share one promise. */
function transformers(): Promise<TransformersModule> {
  pendingModule ??= import('@huggingface/transformers')
    .then(mod => mod as unknown as TransformersModule)
  return pendingModule
}

/** The lazily built pipeline, or undefined until the first request. */
let pendingPipeline: Promise<LoadedPipeline> | undefined

/** Build the pipeline once: configure the environment, then adopt the weights. */
function pipelineSingleton(): Promise<LoadedPipeline> {
  pendingPipeline ??= (async () => {
    const dtype = resolveDtype()
    if (dtype === undefined) throw missingWeights()
    const mod = await transformers()
    Object.assign(mod.env, {
      allowRemoteModels: false,
      allowLocalModels: true,
      localModelPath: MODEL_ROOT,
      cacheDir: CACHE_DIR,
    })
    return (await mod.pipeline('text-generation', MODEL_ID, {
      dtype,
      device: 'cpu',
      local_files_only: true,
    })) as unknown as LoadedPipeline
  })()
  return pendingPipeline
}

/**
 * Serialize requests. A pipeline holds one set of intermediate buffers, so two
 * overlapping generations would interleave their own deltas; the queue also
 * keeps a burst of sessions from both allocating KV caches at once.
 */
let tail: Promise<unknown> = Promise.resolve()

/** Run one queued task, isolated so a rejection never breaks the chain. */
function queued<T>(task: () => Promise<T>): Promise<T> {
  const result = tail.then(task, task)
  tail = result.then(() => undefined, () => undefined)
  return result
}

/**
 * Drain a conversation into chat messages.
 *
 * Only text survives: image and file blocks are dropped because this model
 * takes text alone, and tool blocks would describe tools the model cannot
 * call. Tool results are labelled rather than silently renamed away, so the
 * model can still read what happened.
 */
export function toChatMessages(
  raw: readonly { role: string; content: readonly unknown[] }[],
  systemText?: string,
): ChatMessage[] {
  const out: ChatMessage[] = []
  const push = (role: ChatMessage['role'], content: string): void => {
    if (content.length === 0) return
    out.push({ role, content })
  }
  if (systemText !== undefined && systemText.length > 0) push('system', systemText)
  for (const message of raw) {
    const text = message.content
      .filter((block): block is { type: 'text'; text: string } =>
        typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text')
      .map(block => block.text)
      .join('\n')
    if (message.role === 'system' || message.role === 'developer') push('system', text)
    else if (message.role === 'user') push('user', text)
    else if (message.role === 'assistant') push('assistant', text)
    else push('user', `[${message.role}] ${text}`)
  }
  const totalChars = out.reduce((sum, message) => sum + message.content.length, 0)
  if (totalChars <= INPUT_CHAR_CAP) return out
  // Trim from the front rather than the back: the newest turns are the ones a
  // reply must follow.
  const keep: ChatMessage[] = []
  let budget = 0
  for (let index = out.length - 1; index >= 0; index -= 1) {
    const candidate = out[index]!
    if (budget + candidate.content.length > INPUT_CHAR_CAP && keep.length > 0) break
    keep.unshift(candidate)
    budget += candidate.content.length
  }
  return keep
}

/**
 * Split a `<think>`-annotated reply into reasoning and answer runs.
 *
 * Qwen3 emits its deliberation between those tags; forwarding the raw stream
 * would show the user the model's scratchpad. Tags may straddle chunk
 * boundaries, so a partial prefix is held back until it either completes or
 * turns out to be ordinary text.
 */
class ThinkSplitter {
  private state: 'answer' | 'reasoning' = 'answer'
  private held = ''

  /** Consume one streamed piece and return what can be forwarded now. */
  push(piece: string): EmittedPiece[] {
    const out: EmittedPiece[] = []
    let buffer = `${this.held}${piece}`
    this.held = ''
    for (;;) {
      if (this.state === 'answer') {
        const opening = buffer.indexOf(OPEN_TAG)
        if (opening >= 0) {
          const before = buffer.slice(0, opening)
          if (before.length > 0) out.push({ kind: 'answer', text: before })
          this.state = 'reasoning'
          buffer = buffer.slice(opening + OPEN_TAG.length)
          continue
        }
      } else {
        const closing = buffer.indexOf(CLOSE_TAG)
        if (closing >= 0) {
          const before = buffer.slice(0, closing)
          if (before.length > 0) out.push({ kind: 'reasoning', text: before })
          this.state = 'answer'
          buffer = buffer.slice(closing + CLOSE_TAG.length)
          continue
        }
      }
      const marker = this.state === 'answer' ? OPEN_TAG : CLOSE_TAG
      const partial = this.partialSuffix(buffer, marker)
      this.held = partial
      const emit = buffer.slice(0, buffer.length - partial.length)
      if (emit.length > 0) out.push({ kind: this.state, text: emit })
      return out
    }
  }

  /** The longest suffix of `text` that is also a proper prefix of `marker`. */
  private partialSuffix(text: string, marker: string): string {
    for (let take = Math.min(marker.length - 1, text.length); take > 0; take -= 1) {
      if (text.endsWith(marker.slice(0, take))) return text.slice(text.length - take)
    }
    return ''
  }

  /** Flush whatever the final piece left behind. */
  flush(): EmittedPiece[] {
    const rest = this.held
    this.held = ''
    return rest.length === 0 ? [] : [{ kind: this.state, text: rest }]
  }
}

const OPEN_TAG = '<think>'
const CLOSE_TAG = '</think>'

/**
 * Generate one reply.
 *
 * @param messages - already-normalized chat messages.
 * @param options - decoding knobs, already defaulted by the caller.
 * @param signal - aborts the wait; the underlying decode cannot be cancelled,
 *   so its remaining pieces are simply dropped.
 */
export async function generate(
  messages: readonly ChatMessage[],
  options: { maxTokens: number; temperature: number; topP: number },
  signal?: AbortSignal,
): Promise<GenerationResult> {
  const pipelineInstance = await queued(() => pipelineSingleton())
  signal?.throwIfAborted()

  const pieces: EmittedPiece[] = []
  let notify: (() => void) | undefined
  let finished = false
  let failure: unknown
  let outputTokens = 0

  const splitter = new ThinkSplitter()
  const wake = (): void => {
    const pending: (() => void) | undefined = notify
    notify = undefined
    pending?.()
  }
  const enqueue = (batch: readonly EmittedPiece[]): void => {
    if (batch.length === 0) return
    pieces.push(...batch)
    wake()
  }

  const Streamer: StreamerConstructor = (await transformers()).TextStreamer
  const streamer = new Streamer(pipelineInstance.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => enqueue(splitter.push(text)),
    token_callback_function: () => {
      outputTokens += 1
    },
  })

  const inputTokens = countInputTokens(messages, pipelineInstance.tokenizer)
  const run = queued(async () => pipelineInstance([...messages], {
    max_new_tokens: options.maxTokens,
    do_sample: options.temperature > 0,
    temperature: options.temperature,
    top_p: options.topP,
    streamer,
  }))
  void run.then(
    () => {
      enqueue(splitter.flush())
      finished = true
      wake()
    },
    (error: unknown) => {
      failure = error
      finished = true
      wake()
    },
  )

  const stream = (async function *(): AsyncGenerator<EmittedPiece> {
    for (;;) {
      while (pieces.length > 0) {
        const piece = pieces.shift()!
        if (signal?.aborted === true) return
        yield piece
      }
      if (finished) return
      await new Promise<void>(done => {
        notify = done
      })
    }
  })()

  return {
    stream,
    done: (async (): Promise<UsageCount> => {
      await run
      if (failure !== undefined) throw failure
      return { inputTokens, outputTokens }
    })(),
  }
}

/**
 * Input token count.
 *
 * Encoding the assembled prompt is the honest answer and cheap relative to a
 * decode; when a tokenizer shape refuses, reporting zero beats failing the
 * whole request over a usage statistic.
 */
function countInputTokens(
  messages: readonly ChatMessage[],
  tokenizer: { encode: (text: string) => unknown },
): number {
  try {
    const text = messages.map(message => `${message.role}: ${message.content}`).join('\n')
    const encoded = tokenizer.encode(text)
    return Array.isArray(encoded) ? encoded.length : 0
  } catch {
    return 0
  }
}
