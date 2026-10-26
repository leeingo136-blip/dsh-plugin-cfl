/**
 * The loop-side writer for the memory recall group.
 *
 * Writing is not a tool: the harness already knows what was said, so the
 * component that owns the `memory` switch starts this watcher, which listens
 * to `session/event` (user input, model reasoning, model reply) and flushes at
 * `agent/turn-stopping` — the same turn boundary the stop hooks use. Nothing
 * here changes what the model sees; only the store grows.
 *
 * It is started only when the row's `memory` switch names a card, so a preset
 * without that switch writes nothing. Subagent sessions are skipped: a
 * delegated child's scratch work is not the user's memory.
 *
 * Failure policy: best-effort and never thrown into the loop. A missing card,
 * a disabled embedding service, a dimension mismatch, or a closed database is
 * logged once and dropped — a turn must not fail because its transcript could
 * not be archived.
 *
 * @module memory-echo-tools/ingest
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  ensureCardSchema,
  insertChunks,
  openCardDb,
  type ChunkInput,
  type WriteFault,
} from '@dsh/api-memory-echo'
import { randomUUID } from 'node:crypto'
import { embedTexts, resolveCard } from './cards.ts'
import { computeSalience, currentEmotionIntensity, recentEmotionPeak } from './salience.ts'
import { stripHarnessMeta } from './text.ts'

/** A model-visible content block, structurally typed (text/reasoning carry `text`). */
interface BlockLike {
  type?: string
  text?: string
}

/** One buffered piece of the transcript, before slicing. */
interface BufferedPiece {
  /** Stored slice kind: conversation for user/assistant text, thought for reasoning. */
  kind: 'conversation' | 'thought'
  /** Role label carried into the chunk's `source` for later filtering. */
  role: string
  text: string
}

/** Slice on blank lines; over-long paragraphs split near 1200 chars. */
function sliceText(text: string, limit = 1200): string[] {
  const paragraphs = text.split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(paragraph => paragraph !== '')
  const slices: string[] = []
  for (const paragraph of paragraphs) {
    if (paragraph.length <= limit) {
      slices.push(paragraph)
      continue
    }
    let rest = paragraph
    while (rest.length > limit) {
      let cut = rest.lastIndexOf('\n', limit)
      if (cut < limit * 0.6) cut = limit
      const piece = rest.slice(0, cut).trim()
      if (piece !== '') slices.push(piece)
      rest = rest.slice(cut).trim()
    }
    if (rest !== '') slices.push(rest)
  }
  return slices
}

/** Join the blocks of one kind (text or reasoning) from a message's content. */
function blocksOf(message: unknown, type: 'text' | 'reasoning'): string {
  const content = (message as { content?: readonly BlockLike[] } | undefined)?.content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block?.type === type && typeof block.text === 'string')
    .map(block => (block.text as string).trim())
    .filter(text => text !== '')
    .join('\n')
}

/** For `assistant/attempt`-style payloads that carry only a stream, no message. */
function messageOf(data: unknown): unknown {
  if (data === null || typeof data !== 'object') return undefined
  return (data as { message?: unknown }).message ?? data
}

/** 记忆无差别记录：只要不是空串就写入（短句、单个语气词也算对话）。 */

export function startIngest(ctx: Context, cardName: string): void {
  /** Transcript buffered for the turn in progress, keyed by session id. */
  const buffer = new Map<string, BufferedPiece[]>()
  /** Serial queue so two turns never interleave their writes. */
  let tail: Promise<void> = Promise.resolve()
  /** Failure messages already logged, so a broken card warns once per session. */
  const warned = new Set<string>()

  const record = (sessionId: string, piece: BufferedPiece): void => {
    if (piece.text === '') return
    const list = buffer.get(sessionId)
    if (list === undefined) buffer.set(sessionId, [piece])
    else list.push(piece)
  }

  const collect = (sessionId: string, event: SessionEvent): void => {
    if (event.type === 'user/message') {
      // 只记真实用户发言：插件注入的 snapshot（前情/梦境等）来源不是 'user'，不能回写成记忆。
      const sourceKind = (event.data as { source?: { kind?: string } }).source?.kind
      if (sourceKind !== undefined && sourceKind !== 'user') return
      const text = stripHarnessMeta(blocksOf(event.data, 'text'))
      if (/^<user:(memory-context|dream)>/u.test(text.trim())) return
      record(sessionId, { kind: 'conversation', role: 'user', text })
      return
    }
    if (event.type !== 'assistant/message') return
    const message = messageOf(event.data)
    // 只记对话正文：思考/推理不是“说过的话”，写进记忆会污染前情。
    record(sessionId, { kind: 'conversation', role: 'assistant', text: stripHarnessMeta(blocksOf(message, 'text')) })
  }

  const writeTurn = async (sessionId: string, turn: number, pieces: readonly BufferedPiece[]): Promise<void> => {
    const card = resolveCard(cardName)
    const base = `会话 ${sessionId.replace(/^session-/, '').slice(0, 8)} · 第 ${turn} 轮`
    const prepared: Array<{ kind: string; role: string; text: string }> = []
    for (const piece of pieces) {
      for (const part of sliceText(piece.text)) {
        if (part === '') continue
        prepared.push({ kind: piece.kind, role: piece.role, text: part })
      }
    }
    if (prepared.length === 0) return
    const addedAt = new Date().toISOString()

    // 结构化 memories 先写：即使 embedding 服务不可用，对话也已经进入记忆表。
    const db = openCardDb(card.address)
    try {
      ensureCardSchema(db)
      const peak = recentEmotionPeak(db, 10)
      const mood = currentEmotionIntensity(db)
      const recentTexts = (db.prepare('SELECT content FROM memories ORDER BY created_at DESC LIMIT 20').all() as Array<{ content: string }>).map(row => row.content)
      const insert = db.prepare(`INSERT INTO memories(id, kind, user_name, content, created_at, salience, source)
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`)
      for (const one of prepared) {
        const kind = one.role === 'user' ? 'user' : 'assistant'
        const salience = computeSalience({ text: one.text, role: one.role, recentEmotionPeak: peak, currentEmotion: mood, recentTexts })
        insert.run(randomUUID(), kind, kind === 'user' ? 'user' : null, one.text, addedAt, salience, `loop · ${base} · ${one.role}`)


      }
    } finally {
      db.close()
    }

    const vectors = await embedTexts(ctx, card, prepared.map(one => one.text))

    // One insert per (kind, role) batch: ChunkMeta is per call, and keeping
    // user / assistant / reasoning batches apart preserves the metadata that
    // memory_recall surfaces back.
    const batches = new Map<string, Array<ChunkInput & { kind: string; role: string }>>()
    for (const [index, one] of prepared.entries()) {
      const key = `${one.kind}\u0000${one.role}`
      const batch = batches.get(key)
      const item = { content: one.text, vector: vectors[index] ?? [], kind: one.kind, role: one.role }
      if (batch === undefined) batches.set(key, [item])
      else batch.push(item)
    }

    for (const batch of batches.values()) {
      const first = batch[0] as { kind: string; role: string } | undefined
      if (first === undefined) continue
      const outcome: WriteFault | { added: number } = insertChunks(
        card.address,
        batch,
        addedAt,
        { kind: first.kind, source: `${base} · ${first.role}` },
      )
      if ('code' in outcome) {
        throw new Error(outcome.code === 'dim-mismatch'
          ? `向量维度不匹配——库为 ${outcome.expected} 维，模型产出 ${outcome.actual} 维；该卡片更换过 embedding 引擎，需重建数据库。`
          : `向量写入失败（${outcome.code}）。`)
      }
    }
  }

  ctx.on('session/event', (session, event) => {
    if (session.header.origin === 'subagent') return
    collect(String(session.id), event)
  })

  ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    const sessionId = String(agent.session.id)
    const pieces = buffer.get(sessionId)
    buffer.delete(sessionId)
    if (pieces === undefined || pieces.length === 0) return
    // Detach from the loop: embedding is slow, and the turn's ending must not
    // wait for an archive. The serial queue keeps turn order intact.
    tail = tail
      .then(() => writeTurn(sessionId, turn, pieces))
      .catch((error: unknown) => {
        // Best-effort by contract: log once per (session, failure) so a card
        // that cannot write does not produce one warning per turn forever.
        const key = `${sessionId}:${String(error)}`
        if (warned.has(key)) return
        warned.add(key)
        ctx.logger.warn(`memory-echo: 第 ${turn} 轮记忆写入失败（已跳过，后续同类失败不再重复提示）`, error)
      })
  })

  // An errored/aborted turn has no turn-stopping dispatch; drop its half-turn
  // buffer instead of folding it into the next turn's write.
  ctx.on('agent/error', ({ agent }) => {
    buffer.delete(String(agent.session.id))
  })
}
