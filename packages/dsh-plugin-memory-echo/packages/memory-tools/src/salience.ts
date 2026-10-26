/**
 * 记忆震撼值（salience）打分：规则化、可复现，每轮一次。
 *
 * 不调用 LLM：信息量 + 情绪强度 + 显式重要信号 + 角色权重。情绪强度优先取
 * 本轮 emotion_event 的最大 |delta|，没有情绪工具调用时用情绪词兜底。
 */
import type { DatabaseSync } from 'node:sqlite'

const EMOTION_WORDS = /(喜欢|讨厌|害怕|生气|愤怒|难过|开心|高兴|感动|失望|绝望|孤独|嫉妒|恨|爱|答应|承诺|约定|离开|分手|背叛|秘密|第一次|永远|记住|别忘|重要|对不起|谢谢)/u
const FACT_WORDS = /(\d{1,4}|今天|明天|昨天|下周|以后|曾经|小时候|学校|公司|家|生日|约定|名字)/u

function clamp(value: number, min = 0.15, max = 0.95): number {
  return Math.min(max, Math.max(min, value))
}

export interface SalienceInput {
  text: string
  role: string
  /** 本轮情绪变化的最大绝对值（0~1）；没有则传 undefined。 */
  emotionDelta?: number | undefined
  /** 该卡片最近若干分钟内的情绪事件最大 |delta|，由调用方查询。 */
  recentEmotionPeak?: number | undefined
  /** 最近若干条记忆正文，用于计算新颖度。 */
  recentTexts?: readonly string[] | undefined
  /** 角色当前情绪强度（0~1）：由 self_state 偏离基线得到。 */
  currentEmotion?: number | undefined
}

/** 字符二元组集合，用于轻量 Jaccard 相似度（无需 embedding）。 */
function bigrams(text: string): Set<string> {
  const clean = text.replace(/[\s\p{P}]/gu, '')
  const set = new Set<string>()
  for (let i = 0; i < clean.length - 1; i += 1) set.add(clean.slice(i, i + 2))
  return set
}

function novelty(text: string, recent: readonly string[]): number {
  if (recent.length === 0) return 1
  const target = bigrams(text)
  if (target.size === 0) return 0.5
  let max = 0
  for (const other of recent) {
    const candidate = bigrams(other)
    if (candidate.size === 0) continue
    let shared = 0
    for (const gram of target) if (candidate.has(gram)) shared += 1
    max = Math.max(max, shared / (target.size + candidate.size - shared))
  }
  return Math.min(1, Math.max(0, 1 - max))
}

export function computeSalience(input: SalienceInput): number {
  const text = input.text.trim()
  // 信息量：长度（400 字封顶）+ 事实要素
  const lengthScore = Math.min(text.length / 400, 1)
  const factScore = FACT_WORDS.test(text) ? 0.5 : 0
  const info = Math.min(1, lengthScore * 0.7 + factScore)

  // 情绪强度：本轮 delta、最近峰值、当前情绪状态、情绪词，取最强的一项。
  const delta = Math.max(input.emotionDelta ?? 0, input.recentEmotionPeak ?? 0, input.currentEmotion ?? 0)
  const wordScore = EMOTION_WORDS.test(text) ? 0.35 : 0
  const emotion = Math.min(1, Math.max(delta, wordScore))

  // 显式重要信号
  const signal = /(记住|别忘|重要|约定|答应|承诺|秘密|第一次|永远|对不起|谢谢)/u.test(text) ? 1 : 0

  // 角色权重：用户的话比模型的话更值得记
  const roleWeight = input.role === 'user' ? 1 : input.role === 'reasoning' ? 0.4 : 0.65

  const novel = novelty(text, input.recentTexts ?? [])

  const score = 0.10 + 0.20 * info + 0.25 * emotion + 0.15 * signal + 0.10 * roleWeight + 0.20 * novel
  return Math.round(clamp(score) * 100) / 100
}

/** 读取角色当前情绪强度：|愉悦度| 与激活度的组合。 */
export function currentEmotionIntensity(db: DatabaseSync): number {
  try {
    const rows = db.prepare("SELECT key, value FROM self_state WHERE key IN ('valence', 'arousal')").all() as Array<{ key: string, value: number }>
    const map = new Map(rows.map(row => [row.key, row.value]))
    const valence = Math.abs(map.get('valence') ?? 0)
    const arousal = Math.min(1, Math.max(0, map.get('arousal') ?? 0.4))
    return Math.min(1, Math.max(0, valence * 0.6 + arousal * 0.4))
  } catch {
    return 0.5
  }
}

/** 读最近一段时间内该卡片的最大情绪变化，作为本轮情绪强度。 */
export function recentEmotionPeak(db: DatabaseSync, minutes = 10): number {
  const since = new Date(Date.now() - minutes * 60_000).toISOString()
  const row = db.prepare('SELECT MAX(ABS(delta)) AS peak FROM emotion_event WHERE ts >= ?').get(since) as
    { peak?: number | null } | undefined
  return Math.min(1, Math.abs(Number(row?.peak ?? 0)))
}
