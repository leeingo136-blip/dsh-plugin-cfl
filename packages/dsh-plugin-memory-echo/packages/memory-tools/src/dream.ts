/**
 * Idle dream: a background, tool-free imagination pass behind the `memory` switch.
 *
 * A tool cannot express this feature: the trigger is "the model stopped and the
 * user has not come back for five minutes", a moment when no turn is running.
 * The first version delivered a follow-up user turn, but a normal turn carries
 * the whole toolset — the model called `bash` in the middle of a dream and then
 * spent its reasoning scolding itself for breaking an instruction it could not
 * possibly keep. So the dream now runs as a **direct model call with no tools
 * at all**: "no tools" is structural instead of a request the model can fail.
 *
 * Flow:
 * - `agent/turn-stopping` (a user turn) arms the 300 s timer;
 * - a `user/message` cancels it (the user is back);
 * - when it fires, the component picks six seed words per-source (user /
 *   reasoning / answer), recalls with the same pipeline `memory_recall` uses,
 *   blends the hits into one paragraph, then asks the model to *dream* over
 *   that material — free association, allowed to be absurd, but anchored to the
 *   supplied fragments;
 * - the dream narrative is written back into the card as `kind: 'dream'`, so a
 *   later `memory_recall` can surface it and the agent "remembers its dream".
 *
 * No turn, no tools, no self-feeding: the dream is a payload in the store, not
 * an interaction in the transcript.
 *
 * @module memory-echo-tools/dream
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import {
  dedupeDreams,
  dedupeMemories,
  ensureCardSchema,
  expandAdjacent,
  openCardDb,
  insertChunks,
  listChunks,
  localDatabaseDir,
  queryLocal,
  scoreRows,
  weightedFrequency,
} from '@dsh/api-memory-echo'
import { embedTexts, resolveCard } from './cards.ts'
import { stripHarnessMeta } from './text.ts'

/** Idle window before one dream. */
export const DREAM_IDLE_MS = 300_000

/** Seed words per dream. */
const WORD_COUNT = 6

/** Words taken from each transcript source before the fallback fill. */
const PER_SOURCE = 2

/** Rolling window per source. */
const MAX_CONTEXT_CHARS = 8_000

/** Paragraph cap for the recalled material. */
const MAX_PARAGRAPH_CHARS = 1_000

/** Dreaming runs hot: reasoning models ignore the knob, non-thinking ones use it. */
const DREAM_TEMPERATURE = 1.25

/** A dream is a paragraph, not an essay. */
const DREAM_MAX_TOKENS = 700

/** Function words that make useless recall seeds. */
const STOPWORDS = new Set([
  '我们', '你们', '他们', '这个', '那个', '这些', '那些', '然后', '所以', '但是', '因为',
  '如果', '就是', '可以', '已经', '还是', '这样', '那样', '什么', '怎么', '现在', '需要',
  '应该', '一个', '不是', '没有', '时候', '进行', '以及', '对于', '通过', '之后', '之前',
  '而且', '并且', '不过', '虽然', '或者', '自己', '这里', '那里', '一下', '一些', '这种',
  '后来', '另外', '同时', '此外', '于是', '还有', '其中', '都要', '还要', '才能', '可能',
  '不会', '不能', '一次', '两种', '方面', '情况',
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'you', 'are', 'was', 'have',
])

/** ICU word segmentation when the runtime ships it (Node does); regex fallback otherwise. */
const SEGMENTER = (() => {
  try {
    return new Intl.Segmenter('zh', { granularity: 'word' })
  } catch {
    return undefined
  }
})()

/** Soft connectives that keep the blend flowing instead of reading as a list. */
const CONNECTORS = ['随后，', '与此同时，', '另外，', '与之相关的是，', '再往后，', '此外，']

/** The minimal LLM face this component consumes (the runtime's `llm` service). */
interface LlmFace {
  stream(options: {
    provider: string
    model: string
    system?: string
    messages: readonly unknown[]
    reasoningEffort?: string
    temperature?: number
    maxTokens?: number
  }): AsyncIterable<StreamChunk>
}

/** A model-visible content block, structurally typed (text/reasoning carry `text`). */
interface BlockLike {
  type?: string
  text?: string
}

/** One recalled memory, merged from its time-adjacent slices. */
interface RecalledMemory {
  text: string
  kind?: string
  source?: string
  addedAt: string
}

/** Live diagnostics surfaced by the `dream_status` tool and the heartbeat file. */
export interface DreamStatus {
  armed: boolean
  fireAt: number | null
  remainingSeconds: number
  idleSeconds: number
  buffers: { user: number, reasoning: number, answer: number }
  /** Last lifecycle event: idle / armed / cancelled / fired / skipped. */
  lastEvent: string
  lastEventAt: string | null
  /** Why the last firing attempt stopped early, if it did. */
  lastSkip: string | null
  /** ISO time of the last dream written to the card. */
  lastDreamAt: string | null
  /** Route the last dream used. */
  lastRoute: string | null
  /** Error text of the last failed attempt, if any. */
  lastError: string | null
  /** Seed words used by the last firing attempt (proof of per-source sampling). */
  lastSeedWords: string[]
  dreaming: boolean
}

/** Options the memory row can pass to steer the dreaming route. */
export interface DreamOptions {
  /** Empty = inherit the agent's own provider. */
  provider?: string
  /** Empty = inherit the agent's own model. */
  model?: string
  /** Idle seconds before a dream; defaults to {@link DREAM_IDLE_MS}. */
  idleSeconds?: number
  /** 每次睡眠做梦的概率（0~1，默认 0.3）。 */
  probability?: number
  /** 睡眠时长（小时，默认 6）。 */
  sleepHours?: number
  /** 每轮对话消耗的体力（默认 0.02）。 */
  staminaDrain?: number
  /** 体力低于该值入睡（默认 0.15）。 */
  sleepThreshold?: number
  /** 醒来后的体力（默认 0.7）。 */
  wakeStamina?: number
  /** 清醒时静息多少秒开始回复体力（默认 600）。 */
  restIdleSeconds?: number
  /** 每次静息回复的体力（默认 0.05）。 */
  restGain?: number
  /** 入睡后到做梦的最短延迟秒数（默认 15）。 */
  dreamDelayMinSeconds?: number
  /** 入睡后到做梦的最长延迟秒数（默认 120）。 */
  dreamDelayMaxSeconds?: number
}

/** Join one message's blocks of a single kind. */
function textOf(message: unknown, type: 'text' | 'reasoning'): string {
  const content = (message as { content?: readonly BlockLike[] } | undefined)?.content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block?.type === type && typeof block.text === 'string')
    .map(block => (block.text as string).trim())
    .filter(text => text !== '')
    .join('\n')
}

/** The message behind an `assistant/message` payload. */
function messageOf(data: unknown): unknown {
  if (data === null || typeof data !== 'object') return undefined
  return (data as { message?: unknown }).message ?? data
}

/**
 * Pick random seed words out of one text.
 *
 * Chinese has no whitespace tokenization here, so ICU segmentation does the
 * work and the regex path is a degraded fallback. Random rather than
 * top-frequency: the point of a dream is to wander.
 */
export function pickWords(text: string, count = WORD_COUNT): string[] {
  const raw: string[] = []
  if (SEGMENTER !== undefined) {
    for (const part of SEGMENTER.segment(text)) if (part.isWordLike) raw.push(part.segment)
  } else {
    raw.push(...text.split(/[^\p{L}\p{N}]+/u))
  }
  const tokens = raw
    .map(token => token.trim())
    .filter(token => token.length >= 2 && token.length <= 8 && !/^\d+$/.test(token))
    .filter(token => !STOPWORDS.has(token.toLowerCase()))
  const unique = [...new Set(tokens)]
  for (let i = unique.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = unique[i] as string
    unique[i] = unique[j] as string
    unique[j] = swap
  }
  return unique.slice(0, count)
}

/**
 * Stratified seed selection: two words from the user's input, two from the
 * model's reasoning and two from its answer. Keeps a long answer from drowning
 * the shorter sources.
 */
export function pickContextWords(context: {
  user: readonly string[]
  reasoning: readonly string[]
  answer: readonly string[]
}, count = WORD_COUNT): string[] {
  const picked: string[] = []
  const sources = ['user', 'reasoning', 'answer'] as const
  for (const source of sources) {
    for (const word of pickWords(context[source].join('\n'), PER_SOURCE)) {
      if (picked.includes(word)) continue
      picked.push(word)
      if (picked.length === count) return picked
    }
  }
  if (picked.length < count) {
    const pooled = sources.map(source => context[source].join('\n')).join('\n')
    for (const word of pickWords(pooled, count * 3)) {
      if (picked.includes(word)) continue
      picked.push(word)
      if (picked.length === count) break
    }
  }
  return picked
}

/** Recall through the same pipeline as `memory_recall`, seeded by random words. */
async function recall(ctx: Context, cardName: string, words: readonly string[]): Promise<RecalledMemory[]> {
  const card = resolveCard(cardName)
  const vectors = await embedTexts(ctx, card, words)
  const pool = new Set<number>()
  for (const vector of vectors) {
    for (const hit of queryLocal(card.address, vector, 15)) pool.add(hit.id)
  }
  const rows = listChunks(card.address)
  if (rows.length === 0) return []
  const candidates = rows.filter(row => pool.has(row.id) || weightedFrequency(row.content, words) > 0)
  if (candidates.length === 0) return []

  const ranked = scoreRows(candidates, words).slice(0, 3)
  const chrono = new Map(rows.map((row, index) => [row.id, index]))
  return ranked.map(seed => {
    const index = chrono.get(seed.row.id) ?? 0
    const picked = expandAdjacent(rows, index, words)
    return {
      text: picked.map(at => rows[at]?.content ?? '').filter(part => part !== '').join('\n'),
      kind: seed.row.kind,
      source: seed.row.source,
      addedAt: seed.row.addedAt,
    }
  })
}

/**
 * Blend recalled memories into one paragraph: split into sentences, drop exact
 * duplicates, take them round-robin across sources, connect with soft
 * transitions. Deliberately not a concatenation.
 */
export function blend(memories: readonly RecalledMemory[]): string {
  const sentences = memories.map(memory => memory.text
    .split(/(?<=[。！？!?；;])|\n+/u)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 8))

  const seen = new Set<string>()
  const picked: string[] = []
  for (let depth = 0; ; depth += 1) {
    let added = false
    for (const list of sentences) {
      const sentence = list[depth]
      if (sentence === undefined) continue
      const key = sentence.replace(/[\s\p{P}]/gu, '').slice(0, 48)
      if (seen.has(key)) continue
      seen.add(key)
      picked.push(sentence)
      added = true
    }
    if (!added) break
  }

  let paragraph = ''
  for (const [index, sentence] of picked.entries()) {
    const piece = index === 0 ? sentence : `${CONNECTORS[index % CONNECTORS.length]}${sentence}`
    if (paragraph.length + piece.length > MAX_PARAGRAPH_CHARS) break
    paragraph += piece
  }
  return paragraph
}

/** The dream instruction: free association anchored to the supplied fragments. */
const DREAM_SYSTEM = [
  '你是同一个助手，现在在打盹。',
  '下面的碎片是你白天留下的一点残影——它们已经被打乱、丢掉上下文，只剩一些句子和词。',
  '',
  '把这件事当成做梦，而不是整理资料：',
  '- 只从给出的句子和词出发，可以夸张、跳跃、错位、拼接、荒诞，允许没有因果；',
  '- 不要去总结、分析、下结论，也不要提出待办或建议；',
  '- 不要提到"提示词""指令""模型""记忆库"这类词，不要执行任何任务；',
  '- 写成 200~400 字的一段梦境叙事，人称随你，读起来像真的梦。',
].join('\n')

/** The user turn of a dream: material in, dream out. */
function dreamInput(paragraph: string, words: readonly string[]): string {
  return [
    '碎片：',
    paragraph,
    '',
    `浮现的词：${words.join('、')}`,
    '',
    '开始做梦。',
  ].join('\n')
}

/** Collect a narrative from one direct model call (no tools, no session turn). */
async function generateDream(
  ctx: Context,
  agent: Agent,
  options: DreamOptions,
  paragraph: string,
  words: readonly string[],
): Promise<{ text: string, route: string }> {
  const llm = (ctx as unknown as { get<T>(name: string): T | undefined }).get<LlmFace>('llm')
  if (llm === undefined) throw new Error('llm 服务不可用')
  // The durable request header is the authoritative route; agent options only
  // carry overrides and can legitimately be empty.
  const header = agent.session.requestHeader()?.config
  const provider = (options.provider ?? '').trim() || agent.options.provider || header?.provider
  const model = (options.model ?? '').trim() || agent.options.model || header?.model
  if (provider === undefined || model === undefined) throw new Error('当前会话没有可用的模型路由')

  const call = async (reasoningEffort?: string): Promise<string> => {
    const assembler = new BlockAssembler()
    for await (const chunk of llm.stream({
      provider,
      model,
      system: DREAM_SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text: dreamInput(paragraph, words) }] }],
      maxTokens: DREAM_MAX_TOKENS,
      // Thinking-enabled routes demand temperature 1 (Anthropic) or ignore it
      // (DeepSeek reasoner); sending a hot value there fails the call, so the
      // fallback attempt omits it entirely.
      ...(reasoningEffort === 'off' ? { temperature: DREAM_TEMPERATURE } : {}),
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    })) {
      assembler.push(chunk)
    }
    return assembler.blocks()
      .filter((block): block is { type: 'text', text: string } => block.type === 'text')
      .map(block => block.text.trim())
      .filter(Boolean)
      .join('\n')
  }

  // Thinking models refuse a literal 'off' on some routes; retry without the
  // effort instead of failing the whole dream.
  try {
    return { text: await call('off'), route: `${provider}/${model}` }
  } catch (error) {
    ctx.logger.warn('memory-echo: 梦境调用未接受 reasoningEffort=off，改用模型默认', error)
    return { text: await call(), route: `${provider}/${model}` }
  }
}

/**
 * Start the idle-dream watcher for one agent scope.
 * @param ctx - agent-scoped context.
 * @param cardName - the `memory` switch's card.
 * @param options - optional route override for the dreaming call.
 */
export function startDream(ctx: Context, cardName: string, options: DreamOptions = {}): { status: () => DreamStatus } {
  const idleMs = Math.max(5, options.idleSeconds ?? Math.round(DREAM_IDLE_MS / 1000)) * 1000
  let timer: NodeJS.Timeout | undefined
  let restTimer: NodeJS.Timeout | undefined
  /** True while a dream call runs, so the timer is not re-armed meanwhile. */
  let dreaming = false
  const context = { user: [] as string[], reasoning: [] as string[], answer: [] as string[] }
  const status: DreamStatus = {
    armed: false,
    fireAt: null,
    remainingSeconds: 0,
    idleSeconds: Math.round(idleMs / 1000),
    buffers: { user: 0, reasoning: 0, answer: 0 },
    lastEvent: 'idle',
    lastEventAt: null,
    lastSkip: null,
    lastDreamAt: null,
    lastRoute: null,
    lastError: null,
    lastSeedWords: [],
    dreaming: false,
  }

  /** 直接读写卡片库；任何失败都退回默认值，绝不影响会话。 */
  const dbCall = <T>(fn: (db: ReturnType<typeof openCardDb>) => T, fallback: T): T => {
    try {
      const card = resolveCard(cardName)
      const db = openCardDb(card.address)
      ensureCardSchema(db)
      try { return fn(db) } finally { db.close() }
    } catch { return fallback }
  }
  const sleepOf = (sessionId: string): { sleeping: boolean, wakeAt: string | null, dreamed: boolean } =>
    dbCall(db => {
      const row = db.prepare('SELECT sleeping, wake_at, dreamed FROM sleep_state WHERE session_id = ?').get(sessionId) as
        { sleeping: number, wake_at: string | null, dreamed: number } | undefined
      return { sleeping: row?.sleeping === 1, wakeAt: row?.wake_at ?? null, dreamed: row?.dreamed === 1 }
    }, { sleeping: false, wakeAt: null, dreamed: false })
  const saveSleep = (sessionId: string, sleeping: boolean, wakeAt: string | null, dreamed: boolean, dreamAt: string | null = null): void => {
    dbCall(db => {
      db.prepare(`INSERT INTO sleep_state(session_id, sleeping, wake_at, dream_at, dreamed, updated_at) VALUES (?, ?, ?, ?, ?, ?)
                  ON CONFLICT(session_id) DO UPDATE SET sleeping=excluded.sleeping, wake_at=excluded.wake_at, dream_at=excluded.dream_at, dreamed=excluded.dreamed, updated_at=excluded.updated_at`)
        .run(sessionId, sleeping ? 1 : 0, wakeAt, dreamAt, dreamed ? 1 : 0, new Date().toISOString())
    }, undefined)
  }
  /** 每轮消耗体力；耗尽后进入睡眠。 */
  const drainStamina = (): number => dbCall(db => {
    db.prepare("UPDATE self_state SET value = MAX(0.05, value - ?), updated_at = ? WHERE key = 'stamina'")
      .run(options.staminaDrain ?? 0.02, new Date().toISOString())
    const row = db.prepare("SELECT value FROM self_state WHERE key = 'stamina'").get() as { value?: number } | undefined
    return Number(row?.value ?? 1)
  }, 1)

  const snapshot = (): DreamStatus => ({
    ...status,
    dreaming,
    armed: timer !== undefined,
    remainingSeconds: timer === undefined || status.fireAt === null
      ? 0
      : Math.max(0, Math.round((status.fireAt - Date.now()) / 1000)),
    buffers: {
      user: context.user.reduce((sum, part) => sum + part.length, 0),
      reasoning: context.reasoning.reduce((sum, part) => sum + part.length, 0),
      answer: context.answer.reduce((sum, part) => sum + part.length, 0),
    },
  })

  const flushStatus = (event: string): void => {
    status.lastEvent = event
    status.lastEventAt = new Date().toISOString()
    status.armed = timer !== undefined
    status.remainingSeconds = snapshot().remainingSeconds
    status.buffers = snapshot().buffers
    status.dreaming = dreaming
    try {
      writeFileSync(join(dirname(localDatabaseDir()), 'dream-status.json'), `${JSON.stringify(status, null, 2)}\n`)
    } catch {
      // Diagnostics must never break the loop.
    }
  }

  const clear = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    status.fireAt = null
  }

  const remember = (source: keyof typeof context, text: string): void => {
    const trimmed = text.trim()
    if (trimmed === '') return
    const buffer = context[source]
    buffer.push(trimmed)
    let total = buffer.reduce((sum, part) => sum + part.length, 0)
    while (total > MAX_CONTEXT_CHARS && buffer.length > 1) total -= (buffer.shift() ?? '').length
  }

  const skip = (reason: string): void => {
    status.lastSkip = reason
    flushStatus('skipped')
  }

  /** 取高震撼记忆与强情绪事件的线索，作为梦的额外素材。 */
  const salientClues = (): string => dbCall(db => {
    const memories = db.prepare('SELECT content FROM memories ORDER BY salience DESC, created_at DESC LIMIT 5').all() as Array<{ content: string }>
    const events = db.prepare('SELECT cause_text FROM emotion_event WHERE cause_text IS NOT NULL AND ABS(delta) >= 0.3 ORDER BY ts DESC LIMIT 3').all() as Array<{ cause_text: string }>
    return [...memories.map(row => row.content), ...events.map(row => row.cause_text)]
      .map(text => text.trim().slice(0, 300))
      .filter(text => text !== '')
      .join('\n')
  }, '')

  /** 按高震撼/强情绪线索逐条检索 RAG，补充梦的素材。 */
  const recallByClues = async (clues: readonly string[]): Promise<RecalledMemory[]> => {
    const card = resolveCard(cardName)
    const out: RecalledMemory[] = []
    for (const clue of clues.slice(0, 4)) {
      try {
        const [vector] = await embedTexts(ctx, card, [clue.slice(0, 200)])
        if (vector === undefined) continue
        for (const hit of queryLocal(card.address, vector, 3)) {
          out.push({ text: hit.content, addedAt: hit.addedAt })
        }
      } catch { /* 单条线索失败不影响整体 */ }
    }
    return out
  }

  const fire = async (agent: Agent): Promise<void> => {
    timer = undefined
    status.fireAt = null
    status.lastSkip = null
    status.lastError = null
    const sessionId = String(agent.session.id)
    const sleep = sleepOf(sessionId)
    if (!sleep.sleeping || sleep.dreamed) return skip('not-sleeping')
    if (agent.status !== 'idle') return skip('agent-busy')
    const words = pickContextWords(context)
    status.lastSeedWords = words
    if (words.length < 2) return skip('too-few-words')

    let paragraph: string
    try {
      const clueTexts = salientClues().split('\n').map(text => text.trim()).filter(text => text !== '')
      const clueHits = await recallByClues(clueTexts)
      const memories = [...clueHits, ...await recall(ctx, cardName, words)]
      if (memories.length === 0) return skip('no-hits')
      paragraph = blend(memories)
    } catch (error) {
      ctx.logger.warn('memory-echo: 梦境检索失败（已跳过）', error)
      return skip('retrieval-failed')
    }
    const clues = salientClues()
    if (clues !== '') paragraph = `${clues}\n${paragraph}`.slice(0, MAX_PARAGRAPH_CHARS * 2)
    if (paragraph === '') return skip('empty-paragraph')

    dreaming = true
    try {
      const { text, route } = await generateDream(ctx, agent, options, paragraph, words)
      if (text === '') return skip('empty-dream')
      const card = resolveCard(cardName)
      const [vector] = await embedTexts(ctx, card, [text])
      const now = new Date()
      const stamp = now.toISOString()
      const entry = `［梦境 ${stamp.slice(0, 16).replace('T', ' ')}］\n${text}`
      const outcome = insertChunks(card.address, [{ content: entry, vector: vector ?? [] }], stamp, {
        kind: 'dream',
        source: `梦境 · ${words.join('/')}`,
      })
      if ('code' in outcome) return skip(`write-${outcome.code}`)
      // 梦后整理：合并重复记忆，避免同一句话反复稀释检索。
      try { dedupeMemories(card.address) } catch { /* 合并失败不影响梦 */ }
      try { dedupeDreams(card.address) } catch { /* 梦境去重失败不影响梦 */ }
      status.lastDreamAt = stamp
      status.lastRoute = route
      saveSleep(sessionId, true, sleepOf(sessionId).wakeAt, true)
      dreaming = false
      flushStatus('fired')
      // Cross-plugin seam: anything that wants to react to a dream (a UI card,
      // an archive, an analytics row) listens for this instead of probing sqlite.
      ;(ctx as unknown as { emit?: (name: string, payload: unknown) => void }).emit?.('memory-echo/dream', {
        session: String(agent.session.id),
        card: card.name,
        at: stamp,
        words,
        text: entry,
        route,
      })
    } catch (error) {
      status.lastError = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 500)
      ctx.logger.warn('memory-echo: 梦境生成失败（已跳过）', error)
      skip('dream-failed')
    } finally {
      dreaming = false
    }
  }


  ctx.on('session/event', (session, event) => {
    if (session.header.origin === 'subagent') return
    if (dreaming) return
    if (event.type === 'user/message') {
      if (restTimer !== undefined) { clearTimeout(restTimer); restTimer = undefined }
      const sessionId = String(session.id)
      const sleep = sleepOf(sessionId)
      if (sleep.sleeping) {
        // 被叫醒：取消梦、结束睡眠、产生负面情绪与特殊状态。
        clear()
        saveSleep(sessionId, false, null, true)
        dbCall(db => {
          const now = new Date().toISOString()
          // 被叫醒同样醒转，体力回到 0.7（但情绪上不好受）。
          db.prepare("UPDATE self_state SET value = ?, updated_at = ? WHERE key = 'stamina'").run(options.wakeStamina ?? 0.7, now)
          for (const [key, delta] of [['annoyance', 0.25], ['confusion', 0.2], ['anger', 0.1]] as const) {
            db.prepare(`INSERT INTO self_state(key, value, updated_at) VALUES (?, 0.5, ?)
                        ON CONFLICT(key) DO UPDATE SET value = MIN(0.95, MAX(0.05, value + ?)), updated_at = excluded.updated_at`)
              .run(key, now, delta)
          }
        }, undefined)
        ;(ctx as unknown as { emit?: (name: string, payload: unknown) => void }).emit?.('memory-echo/wake', {
          session: sessionId,
          text: '你被说话声叫醒了。还没睡够，脑子发沉，心里有点烦。',
        })
        status.lastEvent = 'woken'
        remember('user', stripHarnessMeta(textOf(event.data, 'text')))
        return
      }
      const wasArmed = timer !== undefined
      clear()
      if (wasArmed) flushStatus('cancelled')
      remember('user', stripHarnessMeta(textOf(event.data, 'text')))
      return
    }
    if (event.type === 'assistant/message') {
      const message = messageOf(event.data)
      remember('reasoning', stripHarnessMeta(textOf(message, 'reasoning')))
      remember('answer', stripHarnessMeta(textOf(message, 'text')))
    }
  })

  ctx.on('agent/turn-stopping', ({ agent }) => {
    if (dreaming) return
    const sessionId = String(agent.session.id)
    const stamina = drainStamina()
    const sleep = sleepOf(sessionId)
    // 到点自然醒
    if (sleep.sleeping && sleep.wakeAt !== null && Date.now() >= Date.parse(sleep.wakeAt)) {
      saveSleep(sessionId, false, null, sleep.dreamed)
      // 自然睡醒：休息把体力拉回 0.7。
      dbCall(db => {
        db.prepare("UPDATE self_state SET value = ?, updated_at = ? WHERE key = 'stamina'").run(options.wakeStamina ?? 0.7, new Date().toISOString())
      }, undefined)
      status.lastEvent = 'woke'
      ;(ctx as unknown as { emit?: (name: string, payload: unknown) => void }).emit?.('memory-echo/wake', {
        session: sessionId,
        text: '你睡醒了，体力恢复了不少，脑子还有些余梦的残影。',
      })
      return
    }
    if (sleep.sleeping) return
    // 清醒静息：一段时间不说话就缓慢回复体力。
    if (restTimer !== undefined) clearTimeout(restTimer)
    restTimer = setTimeout(() => {
      dbCall(db => {
        db.prepare("UPDATE self_state SET value = MIN(1, value + ?), updated_at = ? WHERE key = 'stamina'")
          .run(options.restGain ?? 0.05, new Date().toISOString())
      }, undefined)
    }, Math.max(10, options.restIdleSeconds ?? 600) * 1000)
    restTimer.unref?.()
    // 体力耗尽 → 入睡；一次睡眠最多做一次梦，概率较低。
    if (stamina <= (options.sleepThreshold ?? 0.15)) {
      const hours = Math.max(0.01, options.sleepHours ?? 6)
      const wakeAt = new Date(Date.now() + hours * 3600_000).toISOString()
      const dream = Math.random() < Math.min(1, Math.max(0, options.probability ?? 0.3))
      const minDelay = Math.max(1, options.dreamDelayMinSeconds ?? 15)
      const maxDelay = Math.max(minDelay, options.dreamDelayMaxSeconds ?? 120)
      const delay = (minDelay + Math.random() * (maxDelay - minDelay)) * 1000
      const dreamAt = dream ? new Date(Date.now() + delay).toISOString() : null
      saveSleep(sessionId, true, wakeAt, !dream, dreamAt)
      status.lastEvent = 'asleep'
      if (dream) {
        clear()
        status.fireAt = Date.now() + delay
        timer = setTimeout(() => { void fire(agent) }, delay)
        timer.unref?.()
        flushStatus('sleep-armed')
      }
    }
  })

  ctx.on('agent/error', () => {
    clear()
    dreaming = false
  })

  // 持久化恢复：进程重启后，靠周期检查补做已到点的梦。
  const firing = new Set<string>()
  // 用安全查找：未注入 agents 服务时返回 undefined，直接读 ctx.agents 会抛错并导致预设加载失败。
  const agents = (ctx as unknown as { get<T>(name: string): T | undefined }).get<{ get(id: string): Agent | undefined }>('agents')
  const tick = setInterval(() => {
    if (agents === undefined) return
    const due = dbCall(db => db.prepare(`SELECT session_id FROM sleep_state
      WHERE sleeping = 1 AND dreamed = 0 AND dream_at IS NOT NULL AND dream_at <= ?`).all(new Date().toISOString()) as Array<{ session_id: string }>, [])
    for (const row of due) {
      if (firing.has(row.session_id)) continue
      const agent = agents.get(row.session_id)
      if (agent === undefined || agent.status !== 'idle') continue
      firing.add(row.session_id)
      void fire(agent).finally(() => firing.delete(row.session_id))
    }
  }, 30_000)
  tick.unref?.()

  ctx.effect(() => () => {
    clear()
    clearInterval(tick)
  }, 'memory-echo: idle dream timer')
  return { status: snapshot }
}
