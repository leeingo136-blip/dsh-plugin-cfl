/**
 * The local inference engine: llama.cpp driven in-process through
 * node-llama-cpp, reading one vendored GGUF file.
 *
 * Why this backend and not the ONNX Runtime one: a native module is compiled
 * against one runtime's ABI, and the desktop shell runs Electron, whose ABI
 * differs from standard Node's — ONNX Runtime's prebuilt binary loaded, then
 * trapped the instant it decoded (SIGTRAP, no message). llama.cpp's binding
 * survives the same binary: verified loading and generating under Electron.
 * The cost is that a native binary is platform-specific, so the plugin ships
 * one build per platform rather than one universal bundle.
 *
 * Everything resolves from `import.meta.url` — the host never runs with this
 * package as its working directory. The engine is imported dynamically so that
 * merely loading the plugin never pays for reading a gigabyte-scale model.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** This package's root, computed from the compiled module's own location. */
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Where the vendored model lives. */
export function modelRoot(): string {
  return join(PACKAGE_ROOT, 'models')
}

/**
 * Persisted enabled-state record. The account's `enabled` flag is in-memory and
 * resets on every process start; this file is the cross-restart record the
 * account reads on construction so it remembers whether it was previously
 * enabled. It lives inside the package (resolved from `import.meta.url`) and is
 * never touched by harness.
 */
const STATE_DIR = join(PACKAGE_ROOT, '.state')
const ENABLED_FILE = join(STATE_DIR, 'enabled.json')

/** Read the persisted enabled flag; defaults to false when absent or unreadable. */
export function loadEnabled(): boolean {
  try {
    const parsed = JSON.parse(readFileSync(ENABLED_FILE, 'utf8')) as { enabled?: unknown }
    return parsed.enabled === true
  } catch {
    return false
  }
}

/**
 * Persist the enabled flag. Best-effort: a write failure must never break an
 * enable/disable gesture, so errors are swallowed rather than surfaced.
 */
export function saveEnabled(value: boolean): void {
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    writeFileSync(ENABLED_FILE, JSON.stringify({ enabled: value }), 'utf8')
  } catch {
    // Persistence is a convenience; an unwritable state file is not fatal.
  }
}

/**
 * The model actually loaded: the engine auto-detects whichever GGUF is present
 * in `models/`, preferring the xLAM function-calling weight when both exist.
 * xLAM and a plain chat model are driven differently — xLAM takes the tool
 * list injected into its system prompt and answers tool requests as a JSON
 * array, whereas a general chat model simply ignores tools.
 */
interface ModelSelection {
  /** File name on disk, empty when nothing is downloaded yet. */
  file: string
  /** Absolute path to the weight file. */
  path: string
  /** Identity reported to harness; matches the GGUF's own label. */
  id: string
  /** Whether this is the xLAM function-calling model. */
  isXLAM: boolean
}
let cachedSelection: ModelSelection | undefined
function selectModel(): ModelSelection {
  if (cachedSelection !== undefined) return cachedSelection
  let files: string[] = []
  try {
    files = readdirSync(modelRoot()).filter((name) => name.endsWith('.gguf'))
  } catch {
    files = []
  }
  const match = (pattern: RegExp): string | undefined => files.find((name) => pattern.test(name))
  const file = match(/xLAM/i) ?? match(/Qwen3/i) ?? files[0]
  if (file === undefined) {
    cachedSelection = { file: '', path: '', id: 'no-model', isXLAM: false }
    return cachedSelection
  }
  const isXLAM = /xLAM/i.test(file)
  cachedSelection = {
    file,
    path: join(modelRoot(), file),
    id: isXLAM ? 'xLAM-2-3B-fc-r' : 'Qwen3-0.6B-GGUF',
    isXLAM,
  }
  return cachedSelection
}

/** Identity reported to harness for the currently selected weight. */
export function currentModelId(): string {
  return selectModel().id
}

/** Whether the selected weight is the xLAM function-calling model. */
export function isXLAMModel(): boolean {
  return selectModel().isXLAM
}

/** True once some vendored weight file is on disk. */
export function weightsPresent(): boolean {
  const model = selectModel()
  return model.file !== '' && existsSync(model.path)
}

/** The error raised when nothing was downloaded yet. */
function missingWeights(): Error {
  const model = selectModel()
  const want = model.file === '' ? 'xLAM-2-3B-fc-r-Q4_K_M.gguf' : model.file
  return new Error(
    `本地未找到权重文件 ${want}。请在插件目录执行：node scripts/fetch-model.mjs`,
  )
}

/** A chat message as the engine consumes it. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** One token-ish delta handed to the caller, tagged with what it contains. */
export interface EmittedPiece {
  /** 'reasoning' for deliberation, 'answer' for the reply proper. */
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
  /** Streaming pieces, already split out of any reasoning block. */
  stream: AsyncIterable<EmittedPiece>
  /** The model's complete raw output, used to recover tool calls. */
  fullText: Promise<string>
  /** Resolves once generation ends, carrying token counts. */
  done: Promise<UsageCount>
}

/**
 * The narrow shapes used from the engine, declared locally so the loosely
 * typed package surface never leaks into the rest of the plugin.
 */
interface LoadedModel {
  tokenize(text: string): readonly number[]
  detokenize(tokens: readonly number[]): string
  createContext(options: { contextSize: number }): Promise<LlamaContext>
}
interface LlamaContext {
  getSequence(): unknown
  dispose(): Promise<void>
}
interface ChatSession {
  setChatHistory(history: readonly HistoryItem[]): void
  prompt(text: string, options: Record<string, unknown>): Promise<string>
}
type ChatSessionConstructor = new (options: { contextSequence: unknown }) => ChatSession
interface LlamaModule {
  getLlama(): Promise<{ loadModel(options: { modelPath: string }): Promise<LoadedModel> }>
  LlamaChatSession: ChatSessionConstructor
}

/** The lazily loaded module and model, or undefined until the first request. */
let pendingModel: Promise<{ model: LoadedModel; Session: ChatSessionConstructor }> | undefined

/** Load the engine once: import the binding, then adopt the weights. */
function engine(): Promise<{ model: LoadedModel; Session: ChatSessionConstructor }> {
  pendingModel ??= (async () => {
    if (!weightsPresent()) throw missingWeights()
    const mod = await import('node-llama-cpp') as unknown as LlamaModule
    const llama = await mod.getLlama()
    const model = await llama.loadModel({ modelPath: selectModel().path })
    return { model, Session: mod.LlamaChatSession }
  })()
  return pendingModel
}

/**
 * Serialize requests. One context is built per generation, so overlapping
 * ones would each allocate a KV cache; the queue also keeps a burst of
 * sessions from doing that at once.
 */
let tail: Promise<unknown> = Promise.resolve()

/** Run one queued task, isolated so a rejection never breaks the chain. */
function queued<T>(task: () => Promise<T>): Promise<T> {
  const result = tail.then(task, task)
  tail = result.then(() => undefined, () => undefined)
  return result
}

/**
 * Load the model eagerly, off the request path.
 *
 * The first `generate()` would do this anyway; doing it here lets a caller
 * absorb a multi-second load while showing progress, and lets a missing or
 * broken download surface as a card state instead of a failed first turn.
 */
export function warmup(): Promise<void> {
  return queued(async () => {
    await engine()
  })
}

/** A single function the model may call, exactly as harness describes it. */
export interface ToolSpec {
  name: string
  description?: string
  parameters?: Record<string, unknown>
}

/**
 * A stable alias mapping from harness tool names to short, easy-to-emit tokens
 * (`fn0`, `fn1`, …) and from each tool's schema properties to `p0`, `p1`, ….
 *
 * xLAM-2-3B is a small English-trained function-calling model. Handed the real
 * harness tool names — which are Chinese ("读代码", "改代码", …) — it repeatedly
 * hallucinates English shell-isms like "cat" or "cd" instead of reproducing the
 * exact name, and it mis-keys argument names. Feeding it short positional
 * aliases removes nearly all of that drift: the model only has to echo `fn0`
 * and `p0`, which it does reliably, and the plugin maps them back to the real
 * names harness expects. The set is sorted by tool name so the mapping stays
 * stable across turns within a session.
 */
export interface ToolAliasParam {
  /** The alias the model should emit, e.g. `p0`. */
  alias: string
  /** The real schema property name, e.g. `file_path`. */
  real: string
  required: boolean
}
export interface ToolAliasEntry {
  /** The alias the model should emit, e.g. `fn0`. */
  fn: string
  /** The real harness tool name. */
  real: string
  description: string
  params: ToolAliasParam[]
}
export interface ToolAliasSet {
  list: ToolAliasEntry[]
  /** fn alias -> real tool name. */
  fnToReal: Map<string, string>
  /** real tool name -> fn alias. */
  realToFn: Map<string, string>
  /** real tool name -> (param alias -> real param name). */
  paramAliasToReal: Map<string, Map<string, string>>
  /** real tool name -> (real param name -> param alias). */
  paramRealToAlias: Map<string, Map<string, string>>
}

/** Build the deterministic alias set for the current tool list. */
export function buildToolAliases(tools: readonly ToolSpec[]): ToolAliasSet {
  const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name))
  const list: ToolAliasEntry[] = []
  const fnToReal = new Map<string, string>()
  const realToFn = new Map<string, string>()
  const paramAliasToReal = new Map<string, Map<string, string>>()
  const paramRealToAlias = new Map<string, Map<string, string>>()
  sorted.forEach((tool, index) => {
    const fn = `fn${index}`
    fnToReal.set(fn, tool.name)
    realToFn.set(tool.name, fn)
    const schema = tool.parameters as
      | { properties?: Record<string, unknown>; required?: unknown }
      | undefined
    const props = schema?.properties ?? {}
    const required = Array.isArray(schema?.required)
      ? (schema!.required as unknown[]).filter((v): v is string => typeof v === 'string')
      : []
    const params: ToolAliasParam[] = Object.keys(props).map((real, j) => ({
      alias: `p${j}`,
      real,
      required: required.includes(real),
    }))
    list.push({ fn, real: tool.name, description: tool.description ?? '', params })
    const aToR = new Map<string, string>()
    const rToA = new Map<string, string>()
    params.forEach((p) => {
      aToR.set(p.alias, p.real)
      rToA.set(p.real, p.alias)
    })
    paramAliasToReal.set(tool.name, aToR)
    paramRealToAlias.set(tool.name, rToA)
  })
  return { list, fnToReal, realToFn, paramAliasToReal, paramRealToAlias }
}

/**
 * Build the xLAM system-prompt tail that declares the available tools. To keep
 * the model from drifting onto hallucinated English tool names, the tools are
 * presented under short positional aliases (`fn0`, `fn1`, …) with parameters
 * aliased to `p0`, `p1`, …; the real names are shown only as a hint so the
 * model still understands what each function does.
 */
function xlamToolsPrompt(aliases: ToolAliasSet): string {
  const lines = [
    'You are an expert function-calling model. To call a function, output ONLY a JSON array of the form [{"name": "<fn>", "arguments": {<params>}}]. No other text.',
    '',
    'Available functions:',
  ]
  for (const tool of aliases.list) {
    const desc = tool.description.length > 120
      ? `${tool.description.slice(0, 117)}...`
      : tool.description
    lines.push(`- ${tool.fn}: ${desc}`)
    if (tool.params.length > 0) {
      const ps = tool.params
        .map((p) => `${p.alias} (${p.required ? 'required' : 'optional'}, real name: ${p.real})`)
        .join(', ')
      lines.push(`  parameters: { ${ps} }`)
    }
  }
  lines.push(
    '',
    'CRITICAL INSTRUCTIONS:',
    '- Call a function ONLY by its fn name (e.g. fn0). You MUST NOT invent names such as "cat", "cd", "read_file", "bash", "shell", or "browser".',
    '- The arguments object keys MUST be the pN aliases listed above (e.g. p0). Do NOT rename them to "file_path", "path", etc.',
    '- Only call a function when you know the EXACT required value. For a file path you MUST use the real absolute path (or the exact relative path); if you do not know the exact path, do NOT guess — reply and ask the user for it.',
    '- If no listed function fits the request, output NO array at all; reply in natural language instead.',
  )
  return lines.join('\n')
}

/** A text run as extracted from one content block. */
function blockText(block: unknown): string {
  if (typeof block !== 'object' || block === null) return ''
  const typed = block as { type?: unknown; text?: unknown; name?: unknown; arguments?: unknown }
  if (typed.type === 'text' && typeof typed.text === 'string') return typed.text
  return ''
}

/**
 * Translate a normalised argument object (real schema keys) back into the
 * alias form xLAM originally saw, so a prior tool call replays consistently.
 */
function aliasArgsBack(args: unknown, aliases: ToolAliasSet, realName: string): unknown {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return args
  const rToA = aliases.paramRealToAlias.get(realName)
  if (rToA === undefined) return args
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    out[rToA.get(key) ?? key] = value
  }
  return out
}

/**
 * Drain a conversation into chat messages.
 *
 * Text survives. A plain chat model (Qwen) ignores tools entirely. The xLAM
 * model instead receives the tool list — under short aliases — in its system
 * turn, and any prior assistant tool calls replayed as the same alias form it
 * emitted, while tool results come back as labelled user turns — enough for it
 * to chain calls.
 */
export function toChatMessages(
  raw: readonly { role: string; content: readonly unknown[] }[],
  systemText: string | undefined,
  aliases: ToolAliasSet | undefined,
): ChatMessage[] {
  const out: ChatMessage[] = []
  const push = (role: ChatMessage['role'], content: string): void => {
    const trimmed = content.trim()
    if (trimmed.length === 0) return
    out.push({ role, content: trimmed })
  }

  // One system turn carries both the harness system prompt and, for xLAM, the
  // tool declarations (under aliases).
  const systemParts: string[] = []
  if (aliases !== undefined) {
    // xLAM is a small function-calling model. The full harness system prompt is
    // large and the model cannot use it for tool routing, while it balloons the
    // system message past the context window and blocks context-shift
    // compression (the very error "Failed to compress chat history for context
    // shift"). Keep only a one-line instruction plus the tool list it needs.
    systemParts.push('You are a function-calling assistant. Use only the functions listed below; never invent names.')
    systemParts.push(xlamToolsPrompt(aliases))
  } else if (systemText !== undefined && systemText.length > 0) {
    systemParts.push(systemText)
  }
  if (systemParts.length > 0) push('system', systemParts.join('\n\n'))

  for (const message of raw) {
    const blocks = Array.isArray(message.content) ? message.content : []
    if (message.role === 'system' || message.role === 'developer') {
      const text = blocks.map(blockText).filter((line) => line.length > 0).join('\n')
      push('system', text)
      continue
    }
    if (message.role === 'tool') {
      // A tool result: hand it back as a labelled user turn.
      const text = blocks.map(blockText).filter((line) => line.length > 0).join('\n')
      push('user', `Tool result:\n${text}`)
      continue
    }
    if (message.role === 'assistant') {
      // Reconstruct any tool calls this assistant turn already made.
      const calls: { name: string; arguments: unknown }[] = []
      let text = ''
      for (const block of blocks) {
        if (typeof block !== 'object' || block === null) continue
        const typed = block as { type?: unknown; text?: unknown; name?: unknown; arguments?: unknown }
        if (typed.type === 'text' && typeof typed.text === 'string') {
          text += (text ? '\n' : '') + typed.text
        } else if (typed.type === 'tool-call') {
          let args = typed.arguments
          if (typeof args === 'string') {
            try {
              args = JSON.parse(args)
            } catch {
              // Leave the raw string if it is not JSON; xLAM still sees something.
            }
          }
          const realName = String(typed.name ?? '')
          let name = realName
          if (aliases !== undefined) {
            const fn = aliases.realToFn.get(realName)
            if (fn !== undefined) {
              name = fn
              args = aliasArgsBack(args, aliases, realName)
            }
          }
          calls.push({ name, arguments: args })
        }
      }
      if (calls.length > 0) {
        // The model's own prior call, replayed in alias form so xLAM can continue.
        push('assistant', JSON.stringify(calls))
      } else if (text.length > 0) {
        push('assistant', text)
      }
      continue
    }
    // user, or anything else: take the text content.
    const text = blocks.map(blockText).filter((line) => line.length > 0).join('\n')
    push('user', text)
  }

  const totalChars = out.reduce((sum, message) => sum + message.content.length, 0)
  if (totalChars <= INPUT_CHAR_CAP) return out
  // Trim from the front rather than the back: the newest turns are the ones a
  // reply must follow. The system turn (index 0) always survives so the tool
  // list is never lost — without it xLAM has nothing to call.
  const keep: ChatMessage[] = []
  let budget = 0
  for (let index = out.length - 1; index >= 0; index -= 1) {
    const candidate = out[index]!
    const atSystem = index === 0
    if (!atSystem && budget + candidate.content.length > INPUT_CHAR_CAP && keep.length > 0) break
    keep.unshift(candidate)
    budget += candidate.content.length
  }
  return keep
}

/**
 * Split a `<think>`-annotated reply into reasoning and answer runs.
 *
 * Whether deliberation appears depends on the model and its chat template;
 * forwarding it raw would show the user the model's scratchpad. Tags may
 * straddle chunk boundaries, so a partial prefix is held back until it either
 * completes or turns out to be ordinary text.
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
 * One chat-history item as the session consumes it. A model turn carries
 * `response` rather than `text` — the chat wrappers read that field, and a
 * plain `text` there is silently undefined mid-generation.
 */
type HistoryItem =
  | { type: 'system'; text: string }
  | { type: 'user'; text: string }
  | { type: 'model'; response: string[] }

/**
 * Split the prepared messages into the history the session replays and the
 * one turn it must answer.
 */
function splitTurn(messages: readonly ChatMessage[]): { history: HistoryItem[]; prompt: string } {
  const items: HistoryItem[] = messages.map((message) => {
    if (message.role === 'system') return { type: 'system', text: message.content }
    if (message.role === 'assistant') return { type: 'model', response: [message.content] }
    return { type: 'user', text: message.content }
  })
  const last = items[items.length - 1]
  // A session answers the final user turn; everything before it is history.
  if (last !== undefined && last.type === 'user') {
    return { history: items.slice(0, -1), prompt: last.text }
  }
  return { history: items, prompt: '' }
}

/**
 * Parse xLAM's tool-call reply: a JSON array of `{name, arguments}` objects.
 *
 * Tolerant of surrounding prose and ```json fences — it scans for the first
 * `[`, bracket-counts to the matching `]`, and validates each entry names a
 * function. Returns undefined when no well-formed call array is present.
 */
export function parseToolCalls(text: string): { name: string; arguments: unknown }[] | undefined {
  let body = text.trim()
  const fence = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fence) body = fence[1]!
  const start = body.indexOf('[')
  if (start < 0) return undefined
  let depth = 0
  let inStr = false
  let escaped = false
  let end = -1
  for (let index = start; index < body.length; index += 1) {
    const char = body[index]!
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (char === '[') depth += 1
    else if (char === ']') {
      depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
  }
  if (end < 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(body.slice(start, end + 1))
  } catch {
    return undefined
  }
  if (!Array.isArray(parsed)) return undefined
  const calls = parsed
    .filter((entry): entry is { name: string; arguments?: unknown } =>
      typeof entry === 'object' && entry !== null && typeof (entry as { name?: unknown }).name === 'string')
    .map((entry) => ({ name: entry.name, arguments: (entry as { arguments?: unknown }).arguments ?? {} }))
  return calls.length > 0 ? calls : undefined
}

/**
 * Common alias spellings for a schema property name, plus its own orthographic
 * variants. Used to recover the right key when xLAM emits a near-miss (e.g.
 * `file_name` instead of the schema's `file_path`).
 */
function argAliases(prop: string): string[] {
  const p = prop.toLowerCase()
  const variants = [p, p.replace(/[_-]/g, ''), p.replace(/_/g, '-'), p.replace(/-/g, '_')]
  const synonyms: Record<string, string[]> = {
    file_path: ['filepath', 'path', 'file', 'filename', 'file_name', 'name', 'input', 'source', 'src', 'target', 'location'],
    path: ['filepath', 'file', 'filename', 'file_name', 'location', 'src', 'directory', 'dir'],
    content: ['body', 'data', 'text', 'value', 'message', 'payload'],
    query: ['q', 'search', 'keyword', 'text', 'term'],
    command: ['cmd', 'script', 'code', 'shell'],
    url: ['uri', 'link', 'href', 'src', 'address'],
    code: ['source', 'src', 'script', 'snippet'],
    text: ['content', 'body', 'message', 'value'],
    name: ['title', 'label'],
    message: ['content', 'text', 'body', 'prompt'],
    input: ['content', 'text', 'data', 'query', 'prompt'],
    source: ['src', 'code', 'content'],
    target: ['dest', 'destination', 'path', 'file_path'],
    language: ['lang'],
  }
  return [...new Set([...variants, ...(synonyms[p] ?? [])])]
}

/**
 * Map a model-emitted argument object onto the real tool schema's property
 * names. xLAM is loose with key names — it may emit `file_name` where the
 * schema demands `file_path` — so harness's argument validator then rejects the
 * call with INVALID_ARGS. When a declared (especially required) property is
 * missing but the raw object carries an aliased key, move the value onto the
 * correct key. We never invent values, never drop data, and never touch keys
 * that already match.
 *
 * Only an explicit alias table is consulted (no fuzzy substring matching) so a
 * key cannot be mis-routed to the wrong property.
 */
export function normalizeToolArgs(raw: unknown, tool: ToolSpec, aliases?: ToolAliasSet): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const schema = tool.parameters as
    | { properties?: Record<string, unknown>; required?: unknown }
    | undefined
  if (schema === undefined || schema.properties === undefined) return raw
  const declared = Object.keys(schema.properties)
  if (declared.length === 0) return raw
  const required = Array.isArray(schema.required)
    ? (schema.required as unknown[]).filter((v): v is string => typeof v === 'string')
    : []

  const rawObj = raw as Record<string, unknown>
  const result: Record<string, unknown> = { ...rawObj }

  // First, rename any pN param aliases back to their real schema names.
  if (aliases !== undefined) {
    const aToR = aliases.paramAliasToReal.get(tool.name)
    if (aToR !== undefined) {
      for (const [alias, real] of aToR) {
        if (alias in result && !(real in result)) {
          result[real] = result[alias]
          delete result[alias]
        }
      }
    }
  }

  const rawByLower = new Map<string, string>()
  for (const key of Object.keys(result)) rawByLower.set(key.toLowerCase(), key)

  const mustHave = [...required, ...declared.filter((p) => !required.includes(p))]
  for (const prop of mustHave) {
    if (prop in result) continue
    const hit = argAliases(prop)
      .map((alias) => rawByLower.get(alias))
      .find((key): key is string => key !== undefined && key !== prop)
    if (hit !== undefined) {
      result[prop] = rawObj[hit]
      delete result[hit]
      rawByLower.delete(hit.toLowerCase())
    }
  }
  return result
}

/**
 * Best-effort rescue for a common xLAM failure mode: the model echoes a bare
 * filename (no directory, no extension) where a tool expects a real path. It has
 * no filesystem view, so it cannot know the absolute path; harness then resolves
 * the bare name against its workspace root and fails with FS_NOT_FOUND.
 *
 * When a string argument is a bare name and exactly one file in the workspace
 * tree matches it, we rewrite the argument to that real path before handing the
 * call to harness. Multiple or zero matches are left untouched so we never
 * silently point a tool at the wrong file — the original error stays visible.
 */

/** Candidate roots: the process cwd, the plugin's own location, and any repo
 *  root walked up to from either — so a bare name resolves against the repo the
 *  user is actually working in, whatever the desktop process cwd happens to be. */
let cachedRoots: string[] | undefined
function searchRoots(): string[] {
  if (cachedRoots !== undefined) return cachedRoots
  const roots = new Set<string>()
  const cwd = process.cwd()
  roots.add(cwd)
  roots.add(PACKAGE_ROOT)
  const consider = (start: string): void => {
    let cur = start
    for (let index = 0; index < 6; index += 1) {
      if (existsSync(join(cur, 'packages')) || existsSync(join(cur, '.git')) || existsSync(join(cur, 'deepseek-harness'))) {
        roots.add(cur)
      }
      const parent = dirname(cur)
      if (parent === cur) break
      cur = parent
    }
  }
  consider(cwd)
  consider(PACKAGE_ROOT)
  cachedRoots = [...roots]
  return cachedRoots
}

/** Directories we never descend into during the search. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.desktop-build', 'dist', 'build', '.next', 'out', '.cache'])

/** Preferred entry file when a bare name matches a directory rather than a file. */
function pickEntryInDir(dir: string): string | undefined {
  const preferred = ['src/index.ts', 'index.ts', 'src/index.js', 'index.js', 'package.json', 'README.md']
  for (const rel of preferred) {
    const full = join(dir, rel)
    if (existsSync(full)) return full
  }
  return undefined
}

/** Search the workspace tree for a file whose name (or stem) equals `value`. */
function resolveBarePath(value: string): string | undefined {
  const v = value.trim().replace(/^["']|["']$/g, '')
  if (v.length === 0 || v.includes('/') || v.includes('\\') || v.includes(sep)) return undefined

  const candidates: { file: string; prio: number }[] = []
  for (const root of searchRoots()) {
    if (!existsSync(root)) continue
    const stack: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }]
    while (stack.length > 0) {
      const { dir, depth } = stack.pop()!
      if (depth > 8) continue
      let entries
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (entry.name === '.DS_Store') continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue
          if (entry.name === v) {
            const inner = pickEntryInDir(full)
            if (inner !== undefined) candidates.push({ file: inner, prio: 2 })
          }
          stack.push({ dir: full, depth: depth + 1 })
        } else if (entry.isFile()) {
          if (entry.name === v) candidates.push({ file: full, prio: 0 })
          else if (entry.name.replace(/\.[^.]+$/, '') === v) candidates.push({ file: full, prio: 1 })
        }
      }
    }
  }

  if (candidates.length === 0) return undefined
  const uniq = [...new Map(candidates.map((c) => [c.file, c])).values()]
  if (uniq.length === 1) return uniq[0]!.file
  // Multiple matches: only auto-pick when one is strictly higher priority.
  uniq.sort((a, b) => a.prio - b.prio || a.file.length - b.file.length)
  if (uniq[1]! !== undefined && uniq[0]!.prio < uniq[1]!.prio) return uniq[0]!.file
  return undefined
}

/**
 * Rewrite any bare-filename string arguments in a normalised tool-argument
 * object to their resolved real paths. Non-path strings (e.g. a search
 * `pattern`) never match a file and are left untouched.
 */
export function resolveBarePaths(args: unknown): unknown {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return args
  const obj = args as Record<string, unknown>
  const out: Record<string, unknown> = { ...obj }
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string') {
      const resolved = resolveBarePath(val)
      if (resolved !== undefined) out[key] = resolved
    }
  }
  return out
}

/**
 * Generate one reply.
 *
 * @param rawMessages - the harness conversation, in its own block format.
 * @param systemText - the harness system prompt.
 * @param aliases - the tool alias set (xLAM only); undefined for a plain chat model.
 * @param options - decoding knobs, already defaulted by the caller.
 * @param signal - aborts the wait; the underlying decode cannot be cancelled,
 *   so its remaining pieces are simply dropped.
 */
export async function generate(
  rawMessages: readonly { role: string; content: readonly unknown[] }[],
  systemText: string | undefined,
  aliases: ToolAliasSet | undefined,
  options: { maxTokens: number; temperature: number; topP: number },
  signal?: AbortSignal,
): Promise<GenerationResult> {
  const { model, Session } = await queued(() => engine())
  signal?.throwIfAborted()

  const pieces: EmittedPiece[] = []
  let notify: (() => void) | undefined
  let finished = false
  let failure: unknown
  let outputTokens = 0
  let fullText = ''

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

  const messages = toChatMessages(rawMessages, systemText, aliases)
  const { history, prompt } = splitTurn(messages)
  // One context per generation: it carries the KV cache, and holding it
  // between turns would let unrelated sessions read each other's state.
  const context = await queued(() => model.createContext({ contextSize: CONTEXT_TOKENS }))
  const session = new Session({ contextSequence: context.getSequence() })
  session.setChatHistory(history)

  const run = queued(async () => {
    fullText = await session.prompt(prompt, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      onToken: (tokens: readonly number[]) => {
        outputTokens += tokens.length
        enqueue(splitter.push(model.detokenize(tokens)))
      },
    })
  }).finally(async () => {
    await context.dispose()
  })
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
    fullText: run.then(() => fullText),
    done: (async (): Promise<UsageCount> => {
      await run
      if (failure !== undefined) throw failure
      const inputText = messages.map(message => `${message.role}: ${message.content}`).join('\n')
      let inputTokens = 0
      try {
        inputTokens = model.tokenize(inputText).length
      } catch {
        // A usage statistic is not worth failing a completed reply over.
        inputTokens = 0
      }
      return { inputTokens, outputTokens }
    })(),
  }
}

/**
 * Context budget. xLAM-2-3B trains to 32K (up to 128K with YaRN); 8192 leaves
 * headroom for a multi-turn tool-calling conversation plus the reply without
 * hitting context-shift compression (which fails when the system message alone
 * is too long). The KV cache is allocated per request and disposed after each
 * generation, so this is a single-request ceiling, not steady-state memory.
 */
const CONTEXT_TOKENS = 8192

/**
 * Cap on prompt characters. The context is allocated per request and nothing
 * else bounds it, so an oversized history fails inside llama.cpp rather than
 * degrading; trimming the oldest turns is cheaper and predictable.
 */
const INPUT_CHAR_CAP = 8_000
