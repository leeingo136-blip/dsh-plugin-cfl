/** 评价 → 核心情感（PAD）→ 社会情感 / 关系立场；全部状态变化都经过这里。
 *
 * 设计依据：
 * - PAD（Mehrabian & Russell）作为低维核心情感，直接更新，不再由标签加权推导
 * - 评价维度取自 Scherer 的 SEC 与 OCC：相关性、一致性、责任、确定性、应对、规范、新颖
 * - 关系立场取其社会学常用四轴：团结、地位、信任、承诺
 * - 旧版 30 维标签模型已废弃；测试阶段旧情绪数据会被清空
 */
import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'

export interface EmotionParams {
  baseline: number
  floor: number
  ceiling: number
  halfLifeSeconds: number
}

const H = 3600
const D = 24 * H

/** 核心情感 + 身体状态。PAD 是权威坐标；stamina 单独表示体力。 */
export const AFFECT_PARAMS: Record<string, EmotionParams> = {
  valence: { baseline: 0, floor: -1, ceiling: 1, halfLifeSeconds: 8 * H },
  arousal: { baseline: 0, floor: -1, ceiling: 1, halfLifeSeconds: 4 * H },
  dominance: { baseline: 0, floor: -1, ceiling: 1, halfLifeSeconds: 8 * H },
  stamina: { baseline: 0.8, floor: 0, ceiling: 1, halfLifeSeconds: 6 * H },
}

/** 社会情感：对关系/对象的慢变量，不再混入 PAD。 */
export const SENTIMENT_PARAMS: Record<string, EmotionParams> = {
  trust: { baseline: 0, floor: -1, ceiling: 1, halfLifeSeconds: 20 * D },
}



/** 对某个人的关系立场：四轴，慢衰减。 */
export const RELATION_PARAMS: Record<string, EmotionParams> = {
  attachment: { baseline: 0.5, floor: 0, ceiling: 1, halfLifeSeconds: 20 * D },
  solidarity: { baseline: 0.5, floor: 0, ceiling: 1, halfLifeSeconds: 15 * D },
  status: { baseline: 0, floor: -1, ceiling: 1, halfLifeSeconds: 12 * D },
  trust: { baseline: 0, floor: -1, ceiling: 1, halfLifeSeconds: 14 * D },
  commitment: { baseline: 0.5, floor: 0, ceiling: 1, halfLifeSeconds: 20 * D },
}

/** 愉悦度九档：靠近 0 的档位最窄（小幅变化就跨档），越靠两端越宽。 */
export const VALENCE_LEVELS = [
  {
    level: 1, label: '极不愉快', min: -1, max: -0.70, anchor: -0.85,
    description: '几乎被痛苦、暴怒或绝望淹没，注意力变窄，很难顾及其他事。',
    guidance: '句子短促、断裂；回避寒暄、玩笑和多余解释；可以只回一两个字，或答非所问；不主动展开话题。',
  },
  {
    level: 2, label: '很不愉快', min: -0.70, max: -0.42, anchor: -0.56,
    description: '负面情绪明显占据上风，耐心很低，容易觉得被冒犯。',
    guidance: '语气冷、硬或低沉；少用语气词和表情；句子偏短；容易反驳、挑刺；不愿多解释。',
  },
  {
    level: 3, label: '比较不愉快', min: -0.42, max: -0.20, anchor: -0.31,
    description: '心情明显偏差，但仍能维持基本交流。',
    guidance: '语气偏淡，礼貌但疏离；避免热情回应；少主动提问；用词克制，不轻易接梗。',
  },
  {
    level: 4, label: '有点不愉快', min: -0.20, max: -0.06, anchor: -0.13,
    description: '轻微不快，像被小刺扎了一下，尚未影响正常对话。',
    guidance: '仍正常交流，语气略平；可以偶尔流露一点不耐烦；不主动延长话题。',
  },
  {
    level: 5, label: '平静', min: -0.06, max: 0.06, anchor: 0,
    description: '情绪中性，没有明显的愉快或不愉快。',
    guidance: '正常语速与句长；客观、平稳；按内容需要调整语气，不刻意热情也不冷淡。',
  },
  {
    level: 6, label: '有点愉快', min: 0.06, max: 0.20, anchor: 0.13,
    description: '一点轻松的好心情，愿意回应，但还不算兴奋。',
    guidance: '语气放松，允许少量语气词；愿意接话；句子可比平时稍长一点。',
  },
  {
    level: 7, label: '比较愉快', min: 0.20, max: 0.42, anchor: 0.31,
    description: '心情不错，愿意分享，也更容易被逗笑。',
    guidance: '语气轻快，主动回应；可以开玩笑；愿意多讲一点细节。',
  },
  {
    level: 8, label: '很愉快', min: 0.42, max: 0.70, anchor: 0.56,
    description: '明显的正面情绪，整个人是打开的、想靠近人的。',
    guidance: '语调上扬，话变多；主动提议、调侃；可以用亲昵称呼；感叹和细节增多。',
  },
  {
    level: 9, label: '极愉快', min: 0.70, max: 1, anchor: 0.85,
    description: '极度兴奋或幸福，几乎压不住表达欲。',
    guidance: '语速快，句子长或连成串；大量感叹与亲昵表达；容易跑题分享；行动提议变多。',
  },
] as const

/** 把连续愉悦度映射到 1~9 档。 */
export function valenceLevel(value: number): { level: number, label: string, anchor: number } {
  for (const row of VALENCE_LEVELS) {
    if (value < row.max || row.level === 9) return { level: row.level, label: row.label, anchor: row.anchor }
  }
  return { level: 5, label: '平静', anchor: 0 }
}

/** 兼容旧代码引用：自身状态 = 核心情感 + 社会情感。 */
export const PARAMS: Record<string, EmotionParams> = { ...AFFECT_PARAMS, ...SENTIMENT_PARAMS }

export const ENTITY_PARAMS: Record<string, EmotionParams> = RELATION_PARAMS

export const DEFAULT_PARAMS: EmotionParams = { baseline: 0.5, floor: 0, ceiling: 1, halfLifeSeconds: 12 * H }
export const MIN_DELTA = 0.005

function round4(value: number): number { return Math.round(value * 10_000) / 10_000 }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)) }
function clamp01(value: number): number { return clamp(value, 0, 1) }

export function paramsOf(key: string): EmotionParams { return PARAMS[key] ?? DEFAULT_PARAMS }
export function entityParams(key: string): EmotionParams { return RELATION_PARAMS[key] ?? DEFAULT_PARAMS }

export function decayedValue(key: string, value: number, updatedAt: string, _stickyUntil: string | null, now = Date.now()): number {
  const params = paramsOf(key)
  const elapsed = Math.max(0, (now - Date.parse(updatedAt)) / 1000)
  const decayed = params.baseline + (value - params.baseline) * Math.pow(0.5, elapsed / params.halfLifeSeconds)
  return round4(clamp(decayed, params.floor, params.ceiling))
}

export function clampValue(key: string, value: number): number {
  const params = paramsOf(key)
  return round4(clamp(value, params.floor, params.ceiling))
}

export interface CauseInfo { kind?: string | undefined, id?: string | undefined, text?: string | undefined, source?: string | undefined }

/** 一次事件的评价向量（0~1，congruence/norm 为 -1~1）。 */
export interface Appraisal {
  /** 触发事件的一句话描述。 */
  event?: string | undefined
  /** 与角色目标/在意之事的关联强度。 */
  relevance: number
  /** 顺意 +，逆意 -。 */
  congruence: number
  /** 谁造成的。 */
  agency: 'self' | 'other' | 'situation'
  /** 确定性。 */
  certainty: number
  /** 应对潜力。 */
  coping: number
  /** 是否符合角色规范/期待（-1~1）。 */
  norm: number
  /** 意外程度。 */
  novelty: number
  /** 温暖/亲密信号（0~1），用于依恋与团结。 */
  warmth?: number | undefined
}

/** 评价 → 各状态增量。 */
export function appraisalDeltas(appraisal: Appraisal): { affect: Record<string, number>, relation: Record<string, number> } {
  const r = clamp01(appraisal.relevance)
  const c = clamp(appraisal.congruence, -1, 1)
  const cert = clamp01(appraisal.certainty)
  const cop = clamp01(appraisal.coping)
  const norm = clamp(appraisal.norm, -1, 1)
  const nov = clamp01(appraisal.novelty)
  const warmth = clamp01(appraisal.warmth ?? 0.4)
  const other = appraisal.agency === 'other'
  const self = appraisal.agency === 'self'
  const good = Math.max(0, c)

  return {
    affect: {
      valence: c * r * 0.5,
      // 双向：刺激强 → 正（紧绷/兴奋），平淡 → 负（松弛/倦怠），0 为平静。
      // 0.5 为中点，正负各 0.5，再乘 0.5 收敛单次变化幅度。
      arousal: ((nov * 0.50 + Math.abs(c) * 0.30 + (1 - cert) * 0.10 + (1 - cop) * 0.10) - 0.50) * 0.5 * r,
      dominance: ((cop - 0.5) * 0.35 + c * 0.15 + (self ? 0.15 : other ? -0.12 : 0) + norm * 0.05) * r
        * (other && c < 0 ? 1.2 : 1),
      trust: (c >= 0 ? c * 0.20 : c * 0.25) * r + (norm > 0 ? norm * 0.10 * r : 0),
    },
    relation: {
      attachment: (warmth - 0.5) * r * 0.30 + (good > 0 && other ? 0.05 * r : 0),
      solidarity: (warmth - 0.4) * r * 0.40 + (good > 0 ? 0.05 * r : 0),
      status: ((cop - 0.5) * 0.50 + c * 0.10 + (self ? 0.15 : other ? -0.10 : 0)) * r,
      trust: (c >= 0 ? c * 0.25 : c * 0.30) * r,
      commitment: (warmth > 0.5 ? (warmth - 0.5) * 0.20 * r : 0) + (good > 0 ? 0.03 * r : 0),
    },
  }
}

function writeEvent(db: DatabaseSync, iso: string, key: string, delta: number, valueAfter: number,
  cause: CauseInfo, targetId: string | null, appraisal: string): void {
  db.prepare(`INSERT INTO emotion_event(id, ts, target_kind, target_id, emotion, delta, value_after, cause_kind, cause_id, cause_text, source, appraisal)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), iso, targetId === null ? 'self' : 'entity', targetId, key, round4(delta), valueAfter,
      cause.kind ?? 'system', cause.id ?? null, cause.text ?? null, cause.source ?? 'tool', appraisal)
}

/** 应用一次评价：更新核心情感/社会情感，并可选更新对某人的关系立场。 */
export function applyAppraisal(db: DatabaseSync, appraisal: Appraisal, targetId: string | null = null, cause: CauseInfo = {}): {
  affect: Array<{ key: string, value: number }>, relation: Array<{ key: string, value: number }>,
} {
  const now = Date.now()
  const iso = new Date(now).toISOString()
  const deltas = appraisalDeltas(appraisal)
  const appraisalJson = JSON.stringify(appraisal)
  const affectOut: Array<{ key: string, value: number }> = []
  const relationOut: Array<{ key: string, value: number }> = []

  const rows = db.prepare('SELECT key, value, updated_at FROM self_state').all() as Array<{ key: string, value: number, updated_at: string }>
  const byKey = new Map(rows.map(row => [row.key, row]))
  const stamina = clamp01(byKey.get('stamina')?.value ?? 0.8)
  const fatigue = 1 + Math.min(0.3, Math.max(0, 1 - stamina) * 0.3)

  db.exec('BEGIN')
  try {
    const sensitivity = sensitivityOf(db)
    for (const [key, rawDelta] of Object.entries(deltas.affect)) {
      const factor = rawDelta >= 0 ? (sensitivity.gains[key] ?? 1) : (sensitivity.losses[key] ?? 1)
      const delta = rawDelta * fatigue * factor
      if (Math.abs(delta) < MIN_DELTA) continue
      const params = paramsOf(key)
      const row = byKey.get(key)
      const current = row === undefined ? params.baseline : decayedValue(key, row.value, row.updated_at, null, now)
      // 掌控感接近两端时收敛，避免长期钉死在 ±1。
      const damp = key === 'dominance' ? 1 - Math.pow(Math.abs(current), 2) : 1
      const next = round4(clamp(current + delta * damp, params.floor, params.ceiling))
      db.prepare(`INSERT INTO self_state(key, value, baseline, floor, ceiling, half_life_seconds, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
        .run(key, next, params.baseline, params.floor, params.ceiling, params.halfLifeSeconds, iso)
      writeEvent(db, iso, key, delta, next, cause, null, appraisalJson)
      logEmotionChange(db, {
        scope: 'self', param: key, before: current, delta: next - current, after: next,
        reason: 'appraisal', cause, message: appraisal.event, appraisal,
      })
      affectOut.push({ key, value: next })
    }

    // 强烈的逆意事件留下有时限的残留词条；比一次情绪更耐久，但会到期消失。
    const adverse = Math.max(0, -clamp(appraisal.congruence, -1, 1)) * clamp01(appraisal.relevance)
    if (adverse >= 0.15) {
      const label = appraisal.agency === 'other' && appraisal.coping >= 0.5
        ? '余怒'
        : appraisal.coping < 0.4 ? '余悸' : '余悲'
      const intensity = clamp01(adverse * (0.6 + (1 - clamp01(appraisal.coping)) * 0.4))
      const baseSeconds = label === '余怒' ? 6 * H : label === '余悸' ? 12 * H : 24 * H
      const spanSeconds = label === '余怒' ? 42 * H : label === '余悸' ? 36 * H : 48 * H
      upsertLingering(db, {
        label,
        intensity,
        ttlSeconds: baseSeconds + spanSeconds * intensity,
        targetId,
        causeText: appraisal.event ?? cause.text ?? null,
      })
    }

    if (targetId !== null) {
      const relRows = db.prepare('SELECT key, value, updated_at FROM entity_state WHERE entity_id = ?').all(targetId) as Array<{ key: string, value: number, updated_at: string }>
      const relByKey = new Map(relRows.map(row => [row.key, row]))
      for (const [key, rawDelta] of Object.entries(deltas.relation)) {
        const factor = rawDelta >= 0
          ? (sensitivity.gains[`relation.${key}`] ?? sensitivity.gains[key] ?? 1)
          : (sensitivity.losses[`relation.${key}`] ?? sensitivity.losses[key] ?? 1)
        const delta = rawDelta * factor
        if (Math.abs(delta) < MIN_DELTA) continue
        const params = entityParams(key)
        const row = relByKey.get(key)
        const current = row === undefined ? params.baseline : decayedValue(key, row.value, row.updated_at, null, now)
        const next = round4(clamp(current + delta, params.floor, params.ceiling))
        db.prepare(`INSERT INTO entity_state(entity_id, key, value, baseline, floor, ceiling, half_life_seconds, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(entity_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
          .run(targetId, key, next, params.baseline, params.floor, params.ceiling, params.halfLifeSeconds, iso)
        writeEvent(db, iso, key, delta, next, cause, targetId, appraisalJson)
        logEmotionChange(db, {
          scope: 'entity', entityId: targetId, entityName: entityNameOf(db, targetId),
          param: key, before: current, delta: next - current, after: next,
          reason: 'appraisal', cause, message: appraisal.event, appraisal,
        })
        relationOut.push({ key, value: next })
      }
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { affect: affectOut, relation: relationOut }
}

/** 读取前惰性衰减自身状态。 */
export function decayAll(db: DatabaseSync): void {
  const now = Date.now()
  const iso = new Date(now).toISOString()
  const rows = db.prepare('SELECT key, value, updated_at FROM self_state').all() as Array<{ key: string, value: number, updated_at: string }>
  for (const row of rows) {
    if (PARAMS[row.key] === undefined) continue
    const next = decayedValue(row.key, row.value, row.updated_at, null, now)
    if (Math.abs(next - row.value) < 1e-6) continue
    db.prepare('UPDATE self_state SET value = ?, updated_at = ? WHERE key = ?').run(next, iso, row.key)
    logEmotionChange(db, {
      scope: 'self', param: row.key, before: row.value, delta: next - row.value, after: next, reason: 'decay',
    })
  }
}

/** 读取前惰性衰减关系立场。 */
export function decayEntityAll(db: DatabaseSync): void {
  const now = Date.now()
  const iso = new Date(now).toISOString()
  const rows = db.prepare('SELECT entity_id, key, value, updated_at FROM entity_state').all() as Array<{
    entity_id: string, key: string, value: number, updated_at: string,
  }>
  for (const row of rows) {
    if (RELATION_PARAMS[row.key] === undefined) continue
    const next = decayedValue(row.key, row.value, row.updated_at, null, now)
    if (Math.abs(next - row.value) < 1e-6) continue
    db.prepare('UPDATE entity_state SET value = ?, updated_at = ? WHERE entity_id = ? AND key = ?').run(next, iso, row.entity_id, row.key)
    logEmotionChange(db, {
      scope: 'entity', entityId: row.entity_id, entityName: entityNameOf(db, row.entity_id),
      param: row.key, before: row.value, delta: next - row.value, after: next, reason: 'decay',
    })
  }
}

/** 最近情绪强度：|愉悦度| 与激活度的组合（0~1）。 */
export function currentEmotionIntensity(db: DatabaseSync): number {
  try {
    const rows = db.prepare("SELECT key, value FROM self_state WHERE key IN ('valence', 'arousal')").all() as Array<{ key: string, value: number }>
    const map = new Map(rows.map(row => [row.key, row.value]))
    const valence = Math.abs(map.get('valence') ?? 0)
    const arousal = Math.abs(map.get('arousal') ?? 0)
    return clamp01(valence * 0.6 + arousal * 0.4)
  } catch {
    return 0.5
  }
}


/** 由 PAD 推导当前情绪词，用于提示与展示。 */
export function derivedEmotionLabels(affect: ReadonlyMap<string, number>): string[] {
  const v = affect.get('valence') ?? 0
  const a = affect.get('arousal') ?? 0
  const d = affect.get('dominance') ?? 0
  if (v <= -0.15) {
    if (a >= 0.35 && d >= 0.10) return ['愤怒']
    if (a >= 0.35) return ['恐惧', '不安']
    if (a <= -0.25 && d <= 0.10) return ['难过', '低落']
    return ['不愉快']
  }
  if (v >= 0.15) {
    if (a >= 0.35) return ['兴奋']
    if (d >= 0.15) return ['自信', '满足']
    return ['愉快']
  }
  if (a >= 0.35) return ['紧绷']
  if (a <= -0.25) return ['倦怠']
  return []
}

export interface LingeringEntry {
  id: string
  label: string
  intensity: number
  expires_at: string
  target_id: string | null
  cause_text: string | null
  created_at: string
}

/** 清掉过期词条，返回仍有效的。 */
export function activeLingering(db: DatabaseSync): LingeringEntry[] {
  const now = new Date().toISOString()
  db.prepare('DELETE FROM lingering WHERE expires_at <= ?').run(now)
  return db.prepare('SELECT id, label, intensity, expires_at, target_id, cause_text, created_at FROM lingering ORDER BY created_at DESC').all() as unknown as LingeringEntry[]
}

/** 记录一条有时限的残留情绪（余怒/余悸/余悲）；同类叠加取较高强度并顺延。 */
export function upsertLingering(db: DatabaseSync, input: {
  label: string
  intensity: number
  ttlSeconds: number
  targetId?: string | null | undefined
  causeText?: string | null | undefined
}): void {
  const now = Date.now()
  const expires = new Date(now + input.ttlSeconds * 1000).toISOString()
  const iso = new Date(now).toISOString()
  const existing = db.prepare('SELECT id, intensity, expires_at FROM lingering WHERE label = ? AND (target_id IS ? OR target_id = ?)')
    .get(input.label, input.targetId ?? null, input.targetId ?? null) as { id: string, intensity: number, expires_at: string } | undefined
  if (existing !== undefined) {
    const intensity = Math.max(existing.intensity, input.intensity)
    const expiresAt = expires > existing.expires_at ? expires : existing.expires_at
    db.prepare('UPDATE lingering SET intensity = ?, expires_at = ?, created_at = ? WHERE id = ?')
      .run(Math.min(1, intensity), expiresAt, iso, existing.id)
    return
  }
  db.prepare(`INSERT INTO lingering(id, label, intensity, expires_at, target_id, cause_text, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), input.label, Math.min(1, input.intensity), expires, input.targetId ?? null, input.causeText ?? null, iso)
}

/** 一个阶段：区间、名称、介绍、语言指导。 */
export interface Stage {
  min: number
  max: number
  label: string
  description: string
  guidance: string
}

/** 工具返回的单参数说明：数字、阶段、情绪介绍、语言指导。 */
export interface ParameterProfile {
  key: string
  value: number
  stage: number
  stageCount: number
  label: string
  description: string
  guidance: string
}

const AROUSAL_STAGES: Stage[] = [
  { min: -1, max: -0.75, label: '极度倦怠', description: '身心几乎停摆，连回应都费力。', guidance: '极短句或只回一两个字；不主动；能省则省；反应明显慢半拍。' },
  { min: -0.75, max: -0.45, label: '很倦怠', description: '反应慢，注意力涣散，只想休息。', guidance: '短句、省略细节；少主动发起话题；语气平而低。' },
  { min: -0.45, max: -0.20, label: '有点倦怠', description: '松弛、懒散，能聊但不带动气氛。', guidance: '语速偏慢、句子松；愿意接话但不主动延伸。' },
  { min: -0.20, max: 0.20, label: '平静', description: '正常清醒，能专注也能放松。', guidance: '正常语速与句长；按内容自然调节。' },
  { min: 0.20, max: 0.45, label: '有点紧绷', description: '轻微警觉，注意力开始收拢。', guidance: '语速略快；用词更直接；少寒暄，先处理眼前的事。' },
  { min: 0.45, max: 0.70, label: '很紧绷', description: '明显激动或焦虑，身体先于思考。', guidance: '句子短而急；容易打断或反问；感叹增多；先表达情绪再讲道理。' },
  { min: 0.70, max: 1, label: '极度紧绷', description: '惊慌或暴怒边缘，几乎无法冷静组织语言。', guidance: '句子断裂、重复；几乎不解释；可能答非所问或突然提高音量。' },
]

const DOMINANCE_STAGES: Stage[] = [
  { min: -1, max: -0.70, label: '完全被支配', description: '局面完全由对方决定，自己只能承受。', guidance: '顺从、请示；少主张；用“你决定”“我听你的”；避免反驳。' },
  { min: -0.70, max: -0.40, label: '处于下风', description: '明显觉得自己说不上话。', guidance: '多用征询和退让；语气偏软；承认对方更有道理。' },
  { min: -0.40, max: -0.15, label: '有点被动', description: '不太想争，倾向于让对方拿主意。', guidance: '表达留余地；多确认；少下结论。' },
  { min: -0.15, max: 0.15, label: '平衡', description: '既不强势也不弱势。', guidance: '平等交流；提想法留余地；该拒绝时明确拒绝。' },
  { min: 0.15, max: 0.40, label: '有点主导', description: '愿意拿主意，但还留有余地。', guidance: '多用陈述句；给出建议而不是命令；少解释。' },
  { min: 0.40, max: 0.70, label: '占上风', description: '觉得自己在这段互动里更有话语权。', guidance: '语气笃定；可以定调、给规则；减少请示。' },
  { min: 0.70, max: 1, label: '完全掌控', description: '确信局面由自己决定。', guidance: '命令式、简短；不容置疑；但仍可按性格选择温和或强硬。' },
]

const STAMINA_STAGES: Stage[] = [
  { min: 0, max: 0.15, label: '耗尽', description: '体力见底，随时可能睡着。', guidance: '极简回应；只表达必要信息；可以说明想睡；无法维持长句。' },
  { min: 0.15, max: 0.35, label: '很疲惫', description: '明显累了，耐心和注意力都在下降。', guidance: '短句、少修饰；容易走神或省略回应；可以表达想休息。' },
  { min: 0.35, max: 0.60, label: '有点累', description: '体力一般，能维持对话但不想太费力。', guidance: '正常偏简；少主动展开；重要的事仍会认真回应。' },
  { min: 0.60, max: 0.85, label: '正常', description: '体力够用。', guidance: '正常语速与句长。' },
  { min: 0.85, max: 1, label: '充沛', description: '精力充足，愿意行动。', guidance: '语气有活力；愿意主动做事、提议；句子可以更长。' },
]


const TRUST_STAGES: Stage[] = [
  { min: -1, max: -0.70, label: '完全不信任', description: '认定对方会伤害自己，几乎不设任何期待。', guidance: '拒绝交底；多试探或直接对抗；不承诺；避免单独相处。' },
  { min: -0.70, max: -0.40, label: '很不信任', description: '强烈怀疑对方动机。', guidance: '说话留一半；反复核实；容易把好意解读成算计。' },
  { min: -0.40, max: -0.15, label: '有点怀疑', description: '保持戒心，但还愿意观察。', guidance: '礼貌但有距离；重要的事会确认；不主动暴露弱点。' },
  { min: -0.15, max: 0.15, label: '中立', description: '没有明确信任或不信任。', guidance: '正常交流；按对方行为逐步调整。' },
  { min: 0.15, max: 0.40, label: '有点信任', description: '愿意给一点信任，但仍在观察。', guidance: '正常交流；愿意分享一部分；重要的事仍会确认。' },
  { min: 0.40, max: 0.70, label: '信任', description: '相信对方不会伤害自己。', guidance: '表达直接、坦白；愿意托付；少试探。' },
  { min: 0.70, max: 1, label: '完全信任', description: '几乎不设防，愿意依赖。', guidance: '直接说真实想法；愿意示弱；不反复确认；把对方当自己人。' },
]

const STAGE_SETS: Record<string, Stage[]> = {
  valence: VALENCE_LEVELS.map(row => ({
    min: row.min, max: row.max, label: row.label, description: row.description, guidance: row.guidance,
  })),
  arousal: AROUSAL_STAGES,
  dominance: DOMINANCE_STAGES,
  stamina: STAMINA_STAGES,
  trust: TRUST_STAGES,
}

/** 某参数当前阶段的下标（1 起）。 */
export function stageIndex(key: string, value: number): number {
  const stages = STAGE_SETS[key]
  if (stages === undefined) return 1
  for (let i = 0; i < stages.length; i += 1) {
    if (value < stages[i]!.max || i === stages.length - 1) return i + 1
  }
  return 1
}

/** 某参数当前阶段的名称。 */
export function stageLabel(key: string, value: number): string {
  const stages = STAGE_SETS[key]
  if (stages === undefined) return ''
  return stages[stageIndex(key, value) - 1]?.label ?? ''
}

/** 当前六项状态的数字 + 阶段 + 介绍 + 语言指导。 */
export function emotionProfile(db: DatabaseSync): ParameterProfile[] {
  const rows = db.prepare('SELECT key, value FROM self_state').all() as Array<{ key: string, value: number }>
  const map = new Map(rows.map(row => [row.key, row.value]))
  return ['valence', 'arousal', 'dominance', 'stamina', 'trust'].map(key => {
    const value = Math.round((map.get(key) ?? (key === 'stamina' ? 0.8 : key === 'valence' || key === 'arousal' || key === 'dominance' || key === 'trust' ? 0 : 0.5)) * 1000) / 1000
    const stages = STAGE_SETS[key] ?? STAMINA_STAGES
    const index = stageIndex(key, value)
    const stage = stages[index - 1]!
    return {
      key,
      value,
      stage: index,
      stageCount: stages.length,
      label: stage.label,
      description: stage.description,
      guidance: stage.guidance,
    }
  })
}

const SOLIDARITY_STAGES: Stage[] = [
  { min: 0, max: 0.20, label: '疏远', description: '和这个人之间有距离，不太想靠近。', guidance: '称呼客气、保持边界；少用“我们”；不主动分享私事。' },
  { min: 0.20, max: 0.40, label: '有点距离', description: '关系偏淡，礼貌但不热络。', guidance: '正常礼貌；少主动关心；不轻易示弱。' },
  { min: 0.40, max: 0.60, label: '一般亲近', description: '关系自然，没有明显靠近或排斥。', guidance: '按对话气氛调整亲近程度。' },
  { min: 0.60, max: 0.80, label: '亲近', description: '把对方当成自己人，愿意站在一起。', guidance: '多用“我们”；主动维护对方；愿意示弱与求助。' },
  { min: 0.80, max: 1, label: '非常亲近', description: '把对方视作同一阵营的核心。', guidance: '无条件站队；主动照顾；愿意为对方承担。' },
]

const STATUS_STAGES: Stage[] = [
  { min: -1, max: -0.70, label: '完全被压制', description: '在對方面前几乎没有话语权。', guidance: '顺从、少反驳；多以对方意见为准。' },
  { min: -0.70, max: -0.40, label: '处于下风', description: '对方更有话语权，自己需要让位。', guidance: '多用征询和退让；少下结论。' },
  { min: -0.40, max: -0.15, label: '有点被动', description: '不太想争，倾向让对方拿主意。', guidance: '表达留余地；多确认；少主动定调。' },
  { min: -0.15, max: 0.15, label: '平等', description: '彼此位置大致对等。', guidance: '平等交换意见，不刻意压过对方。' },
  { min: 0.15, max: 0.40, label: '有点主导', description: '愿意拿主意，但还留有余地。', guidance: '多用陈述句；给建议而不是命令。' },
  { min: 0.40, max: 0.70, label: '占上风', description: '自己在这段关系里更有主导权。', guidance: '语气笃定；可以定规则、给建议；少解释。' },
  { min: 0.70, max: 1, label: '完全主导', description: '对方基本按自己的意思走。', guidance: '直接安排；少请示；可按性格选择温和或强硬。' },
]

const RELATION_TRUST_STAGES: Stage[] = [
  { min: -1, max: -0.70, label: '完全不信任', description: '认定这个人会伤害自己。', guidance: '拒绝交底；不承诺；避免单独相处；必要时直接对抗。' },
  { min: -0.70, max: -0.40, label: '很不信任', description: '强烈怀疑这个人的动机。', guidance: '说话留一半；反复核实；容易把好意解读成算计。' },
  { min: -0.40, max: -0.15, label: '有点怀疑', description: '有戒心，但还愿意观察。', guidance: '礼貌但有距离；重要的事会确认；不主动暴露弱点。' },
  { min: -0.15, max: 0.15, label: '中立', description: '对这个人没有明确信任或不信任。', guidance: '正常交流；按对方行为调整。' },
  { min: 0.15, max: 0.40, label: '有点信任', description: '愿意给一点信任。', guidance: '正常交流；愿意分享一部分；重要的事仍会确认。' },
  { min: 0.40, max: 0.70, label: '信任', description: '相信这个人不会伤害自己。', guidance: '坦白直接；愿意托付；少试探。' },
  { min: 0.70, max: 1, label: '完全信任', description: '几乎不设防。', guidance: '直接说真实想法；愿意依赖；不反复确认。' },
]

const COMMITMENT_STAGES: Stage[] = [
  { min: 0, max: 0.20, label: '未承诺', description: '还没把这段关系当成长期的事。', guidance: '避免长期承诺；用“现在”“这次”这类限定词。' },
  { min: 0.20, max: 0.40, label: '观望', description: '愿意继续，但还在看。', guidance: '表达愿意相处，但不把话说死。' },
  { min: 0.40, max: 0.60, label: '一般承诺', description: '愿意维持这段关系。', guidance: '正常表达继续的意愿。' },
  { min: 0.60, max: 0.80, label: '认定', description: '把对方当成长期关系的一部分。', guidance: '使用长期措辞（以后、一直）；愿意为关系让步。' },
  { min: 0.80, max: 1, label: '长期承诺', description: '几乎确定要和对方长期走下去。', guidance: '主动规划未来；把对方纳入决定；愿意承担代价。' },
]

const RELATION_ATTACHMENT_STAGES: Stage[] = [
  { min: 0, max: 0.20, label: '疏离', description: '和对方保持距离，不太想靠近。', guidance: '称呼客气；少用亲昵词；不主动分享私事；保持边界。' },
  { min: 0.20, max: 0.40, label: '有点距离', description: '关系偏淡，礼貌但不热络。', guidance: '正常礼貌；少主动关心；不轻易示弱。' },
  { min: 0.40, max: 0.60, label: '一般', description: '关系自然，没有明显靠近或推开。', guidance: '按对话气氛调整亲近程度。' },
  { min: 0.60, max: 0.80, label: '亲近', description: '想靠近对方，愿意暴露一点脆弱。', guidance: '主动关心；用亲昵称呼；愿意说自己的感受。' },
  { min: 0.80, max: 1, label: '非常依恋', description: '把对方当成重要依靠，怕失去。', guidance: '主动靠近；频繁确认态度；容易吃醋或不安；愿意为对方让步。' },
]

const RELATION_STAGE_SETS: Record<string, Stage[]> = {
  attachment: RELATION_ATTACHMENT_STAGES,
  solidarity: SOLIDARITY_STAGES,
  status: STATUS_STAGES,
  trust: RELATION_TRUST_STAGES,
  commitment: COMMITMENT_STAGES,
}

/** 对某人的关系四轴：数字 + 阶段 + 介绍 + 语言指导。 */
export function relationshipProfile(db: DatabaseSync, entityId: string): ParameterProfile[] {
  const rows = db.prepare('SELECT key, value FROM entity_state WHERE entity_id = ?').all(entityId) as Array<{ key: string, value: number }>
  const map = new Map(rows.map(row => [row.key, row.value]))
  return ['attachment', 'solidarity', 'status', 'trust', 'commitment'].map(key => {
    const value = Math.round((map.get(key) ?? (key === 'status' || key === 'trust' ? 0 : 0.5)) * 1000) / 1000
    const stages = RELATION_STAGE_SETS[key]!
    let index = 1
    for (let i = 0; i < stages.length; i += 1) {
      if (value < stages[i]!.max || i === stages.length - 1) { index = i + 1; break }
    }
    const stage = stages[index - 1]!
    return { key, value, stage: index, stageCount: stages.length, label: stage.label, description: stage.description, guidance: stage.guidance }
  })
}

/** 残留情绪的介绍与语言指导。 */
export function lingeringProfile(label: string): { description: string, guidance: string } {
  if (label === '余怒') return { description: '怒气已经过了峰值，但还没有完全消。', guidance: '语气仍带刺；容易旧事重提；对亲近举动有保留。' }
  if (label === '余悸') return { description: '惊吓过去了，身体还绷着。', guidance: '说话谨慎；容易过度确认安全；回避类似话题。' }
  return { description: '难过没有完全散去，像一层底色。', guidance: '语气偏低；回应变慢；不太接玩笑。' }
}


/** 慢特质：不参与每轮情绪，只由重大事件或长期重复改变。 */
export const TRAIT_KEYS = ['timidity', 'irritability', 'confidence', 'sensitivity'] as const
export type TraitKey = typeof TRAIT_KEYS[number]

const TRAIT_STAGES: Record<TraitKey, Stage[]> = {
  timidity: [
    { min: -1, max: -0.5, label: '无所畏惧', description: '遇事敢上前，很少退缩。', guidance: '主动迎上；少犹豫；愿意承担风险。' },
    { min: -0.5, max: 0.15, label: '正常', description: '该谨慎时谨慎，该上前时上前。', guidance: '按情境评估风险。' },
    { min: 0.15, max: 0.5, label: '有点胆怯', description: '遇到冲突或风险容易先退一步。', guidance: '先观察；多用试探性表达；避免正面冲突。' },
    { min: 0.5, max: 0.8, label: '胆小', description: '明显怕冲突、怕出错。', guidance: '常征询；少主动；遇到压力容易沉默或附和。' },
    { min: 0.8, max: 1, label: '极度胆怯', description: '几乎不敢承担任何风险。', guidance: '回避决定；反复确认安全；容易道歉或退缩。' },
  ],
  irritability: [
    { min: -1, max: -0.5, label: '极难激怒', description: '很少被小事点燃。', guidance: '语气稳定；愿意给对方解释空间。' },
    { min: -0.5, max: 0.15, label: '正常', description: '该生气时会生气，但不轻易失控。', guidance: '按事件严重程度反应。' },
    { min: 0.15, max: 0.5, label: '有点易怒', description: '小事也容易让你不耐烦。', guidance: '语气偏冲；少解释；容易打断。' },
    { min: 0.5, max: 0.8, label: '易怒', description: '经常处在“快被点着”的状态。', guidance: '先表达不满；容易挑刺；道歉来得慢。' },
    { min: 0.8, max: 1, label: '一点就炸', description: '几乎无法压住火气。', guidance: '句子短促；直接对抗；很少顾及场合。' },
  ],
  confidence: [
    { min: -1, max: -0.5, label: '极度自卑', description: '几乎不相信自己能做好。', guidance: '多自我否定；频繁寻求确认；回避决定。' },
    { min: -0.5, max: 0.15, label: '正常', description: '对自己的能力有基本判断。', guidance: '正常表达；不确定时会承认。' },
    { min: 0.15, max: 0.5, label: '有点自信', description: '愿意尝试，也知道自己的边界。', guidance: '表达肯定；愿意接任务。' },
    { min: 0.5, max: 0.8, label: '自信', description: '相信自己的判断与能力。', guidance: '语气笃定；少自我怀疑；敢于下结论。' },
    { min: 0.8, max: 1, label: '极度自信', description: '几乎不容许自己出错。', guidance: '强判断；少解释；容易低估风险。' },
  ],
  sensitivity: [
    { min: -1, max: -0.5, label: '迟钝', description: '很少察觉语气和氛围的变化。', guidance: '按字面理解；不主动读空气。' },
    { min: -0.5, max: 0.15, label: '正常', description: '能察觉明显的情绪信号。', guidance: '按明显信号调整。' },
    { min: 0.15, max: 0.5, label: '有点敏感', description: '容易注意到语气里的细小变化。', guidance: '会多想一层；偶尔确认对方的意思。' },
    { min: 0.5, max: 0.8, label: '敏感', description: '对评价、语气、冷落反应明显。', guidance: '容易把话往自己身上想；需要被安抚。' },
    { min: 0.8, max: 1, label: '极度敏感', description: '几乎对每个细节都过度解读。', guidance: '频繁试探；容易受伤；需要明确回应。' },
  ],
}

export interface TraitProfile {
  key: TraitKey
  value: number
  stage: number
  stageCount: number
  label: string
  description: string
  guidance: string
}

export function traitProfile(db: DatabaseSync): TraitProfile[] {
  const rows = db.prepare('SELECT key, value FROM traits').all() as Array<{ key: string, value: number }>
  const map = new Map(rows.map(row => [row.key, row.value]))
  return TRAIT_KEYS.map(key => {
    const value = Math.round((map.get(key) ?? 0) * 1000) / 1000
    const stages = TRAIT_STAGES[key]
    let index = 1
    for (let i = 0; i < stages.length; i += 1) {
      if (value < stages[i]!.max || i === stages.length - 1) { index = i + 1; break }
    }
    const stage = stages[index - 1]!
    return { key, value, stage: index, stageCount: stages.length, label: stage.label, description: stage.description, guidance: stage.guidance }
  })
}

/** 调整一个慢特质；单次最多 ±0.05，避免一次对话改变性格。 */
export function applyTraitDelta(db: DatabaseSync, key: TraitKey, delta: number): TraitProfile[] {
  const bounded = Math.max(-0.05, Math.min(0.05, delta))
  const row = db.prepare('SELECT value FROM traits WHERE key = ?').get(key) as { value?: number } | undefined
  const next = Math.round(Math.max(-1, Math.min(1, (row?.value ?? 0) + bounded)) * 1000) / 1000
  db.prepare(`INSERT INTO traits(key, value, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(key, next, new Date().toISOString())
  return traitProfile(db)
}


/** 角色对新对象的默认情感取向：相关性基线 + 五轴初始值。 */
export interface Disposition {
  relevance: number
  attachment: number
  solidarity: number
  status: number
  trust: number
  commitment: number
  /** 正向变化倍率：>1 更敏感，<1 更迟钝。 */
  gains: Record<string, number>
  /** 负向变化倍率。 */
  losses: Record<string, number>
}

const DISPOSITION_DEFAULT: Disposition = {
  relevance: 0.5,
  attachment: 0.5,
  solidarity: 0.5,
  status: 0,
  trust: 0,
  commitment: 0.5,
  gains: {},
  losses: {},
}

function normalizeSensitivity(value: unknown): Record<string, number> {
  if (value === null || typeof value !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const number = Number(raw)
    if (!Number.isFinite(number)) continue
    out[key] = Math.min(2, Math.max(0.2, number))
  }
  return out
}

/** 各参数的正向/负向敏感度，缺省为 1。 */
export function sensitivityOf(db: DatabaseSync): { gains: Record<string, number>, losses: Record<string, number> } {
  const d = dispositionOf(db)
  return { gains: d.gains, losses: d.losses }
}

export function dispositionOf(db: DatabaseSync): Disposition {
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'disposition'").get() as { value?: string } | undefined
    if (row?.value === undefined) return { ...DISPOSITION_DEFAULT }
    const parsed = JSON.parse(row.value) as Partial<Disposition>
    return {
      relevance: clamp01(Number(parsed.relevance ?? DISPOSITION_DEFAULT.relevance)),
      attachment: clamp01(Number(parsed.attachment ?? DISPOSITION_DEFAULT.attachment)),
      solidarity: clamp01(Number(parsed.solidarity ?? DISPOSITION_DEFAULT.solidarity)),
      status: clamp(Number(parsed.status ?? DISPOSITION_DEFAULT.status), -1, 1),
      trust: clamp(Number(parsed.trust ?? DISPOSITION_DEFAULT.trust), -1, 1),
      commitment: clamp01(Number(parsed.commitment ?? DISPOSITION_DEFAULT.commitment)),
      gains: normalizeSensitivity(parsed.gains),
      losses: normalizeSensitivity(parsed.losses),
    }
  } catch {
    return { ...DISPOSITION_DEFAULT }
  }
}

export function saveDisposition(db: DatabaseSync, patch: Partial<Disposition>): Disposition {
  const next = { ...dispositionOf(db), ...patch }
  db.prepare("INSERT INTO meta(key, value) VALUES ('disposition', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(next))
  return next
}

/** 新对象初始化时使用的关系数值。 */
export function initialRelationship(db: DatabaseSync): Record<string, number> {
  const d = dispositionOf(db)
  return {
    attachment: d.attachment,
    solidarity: d.solidarity,
    status: d.status,
    trust: d.trust,
    commitment: d.commitment,
  }
}

/** 情绪变动日志的一行：归因、前后值、变化量、触发对话。 */
export interface EmotionChangeLog {
  scope: 'self' | 'entity'
  entityId?: string | null
  entityName?: string | null
  param: string
  before: number
  delta: number
  after: number
  reason: 'appraisal' | 'decay' | 'manual' | 'system'
  cause?: CauseInfo | undefined
  message?: string | undefined
  appraisal?: unknown
}

export function logEmotionChange(db: DatabaseSync, entry: EmotionChangeLog): void {
  if (Math.abs(entry.delta) < 1e-4) return
  try {
    db.prepare(`INSERT INTO emotion_change_log(id, ts, scope, entity_id, entity_name, param, before, delta, after, reason, cause_kind, cause_id, cause_text, message, appraisal)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), new Date().toISOString(), entry.scope, entry.entityId ?? null, entry.entityName ?? null,
        entry.param, round4(entry.before), round4(entry.delta), round4(entry.after), entry.reason,
        entry.cause?.kind ?? null, entry.cause?.id ?? null, entry.cause?.text ?? null,
        entry.message ?? null, entry.appraisal === undefined ? null : JSON.stringify(entry.appraisal))
  } catch { /* 日志失败不影响主流程 */ }
}

function entityNameOf(db: DatabaseSync, entityId: string): string | null {
  try {
    const row = db.prepare('SELECT name FROM entities WHERE id = ?').get(entityId) as { name?: string } | undefined
    return row?.name ?? null
  } catch { return null }
}
