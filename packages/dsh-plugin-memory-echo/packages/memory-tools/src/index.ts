/**
 * Memory-recall capability: two independent switches, one component.
 *
 * - `knowledge: <方案名>` turns on the three RAG tools
 *   (knowledge_add / knowledge_search / knowledge_delete).
 * - `memory: <方案名>` turns on memory_recall, the loop-side writer that
 *   archives every finished turn, and the idle dream that consolidates after
 *   five quiet minutes.
 *
 * A switch set to an empty string is OFF: none of its tools register, so they
 * stay out of every tool list, and the writer never subscribes to session
 * events. The preset row is the only way to turn either on — the container's
 * installation row carries no switches, so nothing is injected by default.
 *
 * The memory group owns `memory_recall`, the per-turn ingest writer and the idle
 * dream; it no longer carries any knowledge-base tools.
 * @module memory-echo-tools
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { embedTexts, resolveCard } from './cards.ts'
import { createSnapshotMessage } from './snapshot.ts'
import { ConnectionStore } from '@dsh/api-memory-echo'
import { startDream } from './dream.ts'
import { startIngest } from './ingest.ts'
import zschema from '@deepseek-ai/schemastery'
import { activeLingering, applyAppraisal, applyTraitDelta, currentEmotionIntensity, decayAll, decayEntityAll, derivedEmotionLabels, dispositionOf, emotionProfile, ensureCardSchema, initialRelationship, lingeringProfile, openCardDb, queryLocal, relationshipProfile, saveDisposition, traitProfile, valenceLevel } from '@dsh/api-memory-echo'

export const inject = ['tools']

/** The schema class instance type, nameable without dragging cosmokit in. */
type SchemaNode = InstanceType<typeof zschema>

/**
 * Two switches, each holding the 方案名称 (the「记忆回想」card name the group
 * binds to). Blank = that whole group is off.
 *
 * Writing is not a tool: the `memory` switch also starts the loop-side writer
 * that archives each turn, so the model only ever reads.
 */
export const Config = zschema.object({
  memory: zschema.string().default('')
    .description('Memory 方案名称（记忆库卡片名）：启用后注入 memory_recall，每轮结束自动写入记忆，并在空闲 5 分钟后做一次「梦境」整理；留空则三者都不启用'),
  dreamProvider: zschema.string().default('')
    .description('梦境调用使用的 provider（留空 = 跟随当前会话）。梦境建议用非思考模型 + 高温，发散度更高'),
  dreamModel: zschema.string().default('')
    .description('梦境调用的 model id（留空 = 跟随当前会话模型）'),
  dreamIdleSeconds: zschema.number().default(300)
    .description('空闲多少秒后做梦（默认 300；调试时可改成 20 快速验证）'),
  dreamProbability: zschema.number().default(0.3)
    .description('每次睡眠做梦的概率（0~1，默认 0.3）'),
  sleepHours: zschema.number().default(6)
    .description('一次睡眠持续多少小时（默认 6）'),
  staminaDrain: zschema.number().default(0.02)
    .description('每轮对话消耗的体力（默认 0.02）'),
  sleepThreshold: zschema.number().default(0.15)
    .description('体力低于该值进入睡眠（默认 0.15）'),
  wakeStamina: zschema.number().default(0.7)
    .description('醒来后的体力（默认 0.7）'),
  restIdleSeconds: zschema.number().default(600)
    .description('清醒静息多少秒回复体力（默认 600）'),
  restGain: zschema.number().default(0.05)
    .description('每次静息回复多少体力（默认 0.05）'),
  dreamDelayMinSeconds: zschema.number().default(15)
    .description('入睡后到做梦的最短延迟秒数（默认 15）'),
  dreamDelayMaxSeconds: zschema.number().default(120)
    .description('入睡后到做梦的最长延迟秒数（默认 120）'),
}) as unknown as SchemaNode

export interface ToolsConfig {
  memory: string
  dreamProvider: string
  dreamModel: string
  dreamIdleSeconds: number
  dreamProbability: number
  sleepHours: number
  staminaDrain: number
  sleepThreshold: number
  wakeStamina: number
  restIdleSeconds: number
  restGain: number
  dreamDelayMinSeconds: number
  dreamDelayMaxSeconds: number
}

/** Tool names, in presentation order. */
export const TOOL_NAMES = [
  'memory_search',
  'entity_save',
  'emotion_apply',
] as const

/** Tool errors surface to the model as failed calls with this exact text. */


/**
 * 解析可选的时间定位参数。
 *
 * 留空（缺省、空串、null）表示「不指定时间」——打分退回「越新越高」。给出时
 * 必须是 `Date.parse` 能识别的 ISO 8601 文本；解析失败直接报错，不静默退回
 * 相对时间，否则「按那天找」会悄悄变成「找最近的」，模型无从察觉。
 */
const output = {
  schema: { type: 'json' } as const,
  render: (_args: unknown, value: unknown): { type: 'text'; text: string }[] =>
    [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

export function apply(ctx: Context, config: ToolsConfig): void {
  const disposers: Array<() => void> = []

  /** Register only an enabled group — a disabled switch injects no tool at all. */
  const registerWhen = (enabled: boolean, register: () => () => void): void => {
    if (enabled) disposers.push(register())
  }
  const memoryCard = config.memory.trim()
  const withMemory = memoryCard !== ''
  /** 待注入的梦境：sessionId → 梦境正文（每次只消费一次）。 */
  const pendingDreams = new Map<string, string>()
  const pendingWakes = new Map<string, string>()
  // Started before the tools so the diagnostic row below can read live state.
  const dream = withMemory
    ? startDream(ctx, memoryCard, {
      provider: config.dreamProvider,
      model: config.dreamModel,
      idleSeconds: config.dreamIdleSeconds,
      probability: config.dreamProbability,
      sleepHours: config.sleepHours,
      staminaDrain: config.staminaDrain,
      sleepThreshold: config.sleepThreshold,
      wakeStamina: config.wakeStamina,
      restIdleSeconds: config.restIdleSeconds,
      restGain: config.restGain,
      dreamDelayMinSeconds: config.dreamDelayMinSeconds,
      dreamDelayMaxSeconds: config.dreamDelayMaxSeconds,
    })
    : undefined

  // --- memory_search（语义回忆：上下文缺失/压缩时主动检索） ---------------
  if (withMemory) {
    registerWhen(true, () => ctx.tools.register(defineTool({
      name: 'memory_search',
      description: '回忆往事：可按关键词、时间范围、震撼值下限检索记忆库。当用户提到「上次」「之前」「你还记得吗」，或需要找某段时间里印象最深的事时调用。不改写记忆正文；命中的片段会小幅提升震撼值（每次 +0.02）。',
      parameters: {
        query: { type: 'string', description: '关键词或自然语言描述；留空则只按时间/震撼值筛选。' },
        since: { type: 'string', description: '可选，ISO 时间，只返回此时间之后的记忆。' },
        until: { type: 'string', description: '可选，ISO 时间，只返回此时间之前的记忆。' },
        minSalience: { type: 'number', description: '可选，震撼值下限（0~1），用于只找印象深刻的事。' },
        topK: { type: 'number', description: '返回条数（默认 8，上限 20）。' },
      },
      output,
      async execute(args: unknown) {
        const body = args as { query?: unknown, since?: unknown, until?: unknown, minSalience?: unknown, topK?: unknown }
        const text = typeof body.query === 'string' ? body.query.trim() : ''
        const since = typeof body.since === 'string' && body.since !== '' ? body.since : ''
        const until = typeof body.until === 'string' && body.until !== '' ? body.until : ''
        if (since !== '' && Number.isNaN(Date.parse(since))) throw new Error('since 必须是 ISO 时间')
        if (until !== '' && Number.isNaN(Date.parse(until))) throw new Error('until 必须是 ISO 时间')
        const minSalience = Math.min(1, Math.max(0, Number(body.minSalience) || 0))
        const card = resolveCard(memoryCard)
        const k = Math.min(Math.max(Number(body.topK) || 8, 1), 20)

        const hits: Array<{ content: string, distance: number, addedAt: string, salience: number }> = []
        const seen = new Set<string>()
        const push = (hit: { content: string, distance: number, addedAt: string, salience: number }): void => {
          if (hit.content === '' || seen.has(hit.content) || hits.length >= k) return
          seen.add(hit.content)
          hits.push(hit)
        }

        // 有查询词：先做语义检索。
        if (text !== '') {
          try {
            const [vector] = await embedTexts(ctx, card, [text])
            if (vector !== undefined) {
              for (const hit of queryLocal(card.address, vector, k)) {
                push({ content: hit.content, distance: hit.distance, addedAt: hit.addedAt, salience: 0 })
              }
            }
          } catch { /* 继续走结构化检索 */ }
        }

        // 结构化检索：关键词 + 时间范围 + 震撼值下限。
        const db = openCardDb(card.address)
        try {
          ensureCardSchema(db)
          const rows = db.prepare(`SELECT content, created_at, salience FROM memories
            WHERE (? = '' OR content LIKE ?)
              AND (? = '' OR created_at >= ?)
              AND (? = '' OR created_at <= ?)
              AND salience >= ?
            ORDER BY salience DESC, created_at DESC LIMIT ?`)
            .all(text, `%${text}%`, since, since, until, until, minSalience, k) as Array<{ content: string, created_at: string, salience: number }>
          for (const row of rows) push({ content: row.content, distance: 0, addedAt: row.created_at, salience: row.salience })
          if (hits.length === 0) {
            const recent = db.prepare('SELECT content, created_at, salience FROM memories ORDER BY created_at DESC LIMIT ?')
              .all(Math.min(k, 10)) as Array<{ content: string, created_at: string, salience: number }>
            for (const row of recent) push({ content: row.content, distance: 0, addedAt: row.created_at, salience: row.salience })
          }

          // 回忆即强化，但同一记忆短时间内只强化一次（默认 6 小时冷却）。
          const cutoff = new Date(Date.now() - 6 * 3600_000).toISOString()
          const update = db.prepare(`UPDATE memories
            SET salience = MIN(0.98, salience + 0.02), last_recalled_at = ?
            WHERE content = ?
              AND (last_recalled_at IS NULL OR last_recalled_at <= ?)`)
          let reinforced = 0
          const now = new Date().toISOString()
          for (const hit of hits) reinforced += Number(update.run(now, hit.content, cutoff).changes ?? 0)
          return { ok: true, database: card.name, query: text, since, until, minSalience, count: hits.length, reinforced, hits }
        } finally {
          db.close()
        }
      },
    })))
  }

  // --- emotion_state（读取自己当前情绪 / 对某人某物的态度） ----------------
  if (withMemory) {
    registerWhen(true, () => ctx.tools.register(defineTool({
      name: 'emotion_state',
      description: '读取角色此刻的真实情绪状态：核心情感（愉悦度/激活度/掌控感）、社会情感（信任）、残留情绪（余怒/余悸/余悲）、体力；每个参数都包含数值、阶段名称、情绪介绍、语言指导四部分。也可以指定一个人或物，读取关系立场（依恋/亲近/地位/信任/承诺），并返回每个关系轴各自的 guidance（由模型自行组合）。回复任何涉及感受、关系或评价的话之前，必须先调用它做自检。只读。',
      parameters: {
        kind: { type: 'string', description: '可选：person 或 object，指定要查询的人/物。' },
        name: { type: 'string', description: '可选：人/物的名称（或用户本人填 user）。' },
      },
      output,
      async execute(args: unknown) {
        const { name } = args as { kind?: unknown, name?: unknown }
        const card = resolveCard(memoryCard)
        const db = openCardDb(card.address)
        try {
          ensureCardSchema(db)
          decayAll(db)
          decayEntityAll(db)
          const affect = Object.fromEntries((db.prepare("SELECT key, value FROM self_state WHERE key IN ('valence','arousal','dominance','stamina')").all() as Array<{ key: string, value: number }>).map(row => [row.key, row.value]))
          const sentiments = Object.fromEntries((db.prepare("SELECT key, value FROM self_state WHERE key IN ('trust')").all() as Array<{ key: string, value: number }>).map(row => [row.key, row.value]))
          const level = valenceLevel(Number(affect['valence'] ?? 0))
          const labels = derivedEmotionLabels(new Map(Object.entries(affect).map(([key, value]) => [key, Number(value)])))
          const lingering = activeLingering(db).map(one => ({
            ...one,
            ...lingeringProfile(one.label),
          }))
          const disposition = dispositionOf(db)
          const result: Record<string, unknown> = {
            ok: true,
            database: card.name,
            disposition,
            instructions: `本角色的默认相关性为 ${disposition.relevance}：除非事件触及核心，否则不要把普通事件评得更高。把 parameters、traits、lingering 的 guidance 一起读，自己组合成这一轮的语气与句长；不要只取一条，也不要向用户报数值。`,
            affect,
            valenceLevel: level,
            hints: labels,
            sentiments,
            parameters: emotionProfile(db),
            traits: traitProfile(db),
            lingering,
            cues: buildEmotionCue(),
          }
          const wantedName = typeof name === 'string' ? name.trim() : ''
          if (wantedName !== '') {
            let entity: { id: string, name: string } | undefined
            entity = (wantedName === 'user'
              ? db.prepare("SELECT id, name FROM entities WHERE user_key = 'user'").get()
              : db.prepare('SELECT id, name FROM entities WHERE name = ?').get(wantedName)) as { id: string, name: string } | undefined
            if (entity === undefined) {
              result.target = null
              result.note = '没有找到该人/物，可先用 entity_save 创建。'
            } else {
              const parameters = relationshipProfile(db, entity.id)
              // 数值同时给一份扁平表，缺省轴也会补上默认值，避免旧对象缺行时没有数字。
              const values = Object.fromEntries(parameters.map(one => [one.key, one.value]))
              result.target = {
                id: entity.id,
                name: entity.name,
                relationship: values,
                values,
                parameters,
                note: '以下每个关系轴都有独立的 guidance；请自己结合这些指导决定称呼、主动性与边界，不要只取一条或逐条照读。',
              }
            }
          }
          return result as never
        } finally {
          db.close()
        }
      },
    })))
  }

  // --- entity_save（记住一个人/物；用户本人用 userKey=user） --------------
  if (withMemory) {
    registerWhen(true, () => ctx.tools.register(defineTool({
      name: 'entity_save',
      description: '记录或更新一个人 / 一个物：只需名称与认知。用户告诉你名字、外号、身份、喜好时，必须用 userKey="user" 记录用户本人；外号、别称、关系都写进认知，不要另开字段。只写人物表，不写记忆正文。',
      parameters: {
        name: { type: 'string', required: true, description: '名称 / 姓名。' },
        cognition: { type: 'string', description: '你对这个人/物的认知：身份、外号、关系、喜好、用途等，可随时修改。' },
        userKey: { type: 'string', description: '用户本人固定传 user；其他人留空。' },
      },
      output,
      async execute(args: unknown) {
        const body = args as { name?: unknown, cognition?: unknown, description?: unknown, userKey?: unknown }
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        if (name === '') throw new Error('name 不能为空')
        const cognition = typeof body.cognition === 'string' ? body.cognition : typeof body.description === 'string' ? body.description : ''
        const userKey = typeof body.userKey === 'string' && body.userKey.trim() !== '' ? body.userKey.trim() : null
        const card = resolveCard(memoryCard)
        const db = openCardDb(card.address)
        try {
          ensureCardSchema(db)
          const now = new Date().toISOString()
          const existing = userKey !== null
            ? db.prepare('SELECT id FROM entities WHERE user_key = ?').get(userKey) as { id?: string } | undefined
            : db.prepare('SELECT id FROM entities WHERE name = ?').get(name) as { id?: string } | undefined
          const entityId = existing?.id ?? randomUUID()
          db.prepare(`INSERT INTO entities(id, user_key, name, cognition, updated_at)
                      VALUES (?, ?, ?, ?, ?)
                      ON CONFLICT(id) DO UPDATE SET user_key = COALESCE(excluded.user_key, entities.user_key),
                        name = excluded.name, cognition = excluded.cognition, updated_at = excluded.updated_at`)
            .run(entityId, userKey, name, cognition, now)
          const initial = initialRelationship(db)
          const insert = db.prepare('INSERT OR IGNORE INTO entity_state(entity_id, key, value, updated_at) VALUES (?, ?, ?, ?)')
          for (const [key, value] of Object.entries(initial)) insert.run(entityId, key, value, now)
          return { ok: true, database: card.name, id: entityId, name, userKey }
        } finally {
          db.close()
        }
      },
    })))
  }

  // --- entity_rename（知道名字后改称呼） ----------------------------------
  if (withMemory) {
    registerWhen(true, () => ctx.tools.register(defineTool({
      name: 'entity_rename',
      description: '当你知道某个人的名字、称呼，或想改变对某个人/物的叫法时调用。只改名称；旧的称呼、身份和“user 就是他”这类信息写进 cognition。用户本人（user_key=user）改名后仍可用 name="user" 查到。',
      parameters: {
        currentName: { type: 'string', description: '当前名称；用户本人可写 user。与 id 二选一。' },
        id: { type: 'string', description: '实体 id；已知时优先用 id。' },
        newName: { type: 'string', required: true, description: '新名称 / 称呼。' },
        cognition: { type: 'string', description: '可选：更新后的认知；不传则保留原认知。' },
      },
      output,
      async execute(args: unknown) {
        const body = args as { currentName?: unknown, id?: unknown, newName?: unknown, cognition?: unknown }
        const newName = typeof body.newName === 'string' ? body.newName.trim() : ''
        if (newName === '') throw new Error('newName 不能为空')
        const id = typeof body.id === 'string' ? body.id.trim() : ''
        const currentName = typeof body.currentName === 'string' ? body.currentName.trim() : ''
        const card = resolveCard(memoryCard)
        const db = openCardDb(card.address)
        try {
          ensureCardSchema(db)
          let row: { id: string, name: string, cognition: string } | undefined
          if (id !== '') row = db.prepare('SELECT id, name, cognition FROM entities WHERE id = ?').get(id) as typeof row
          else if (currentName === 'user') row = db.prepare("SELECT id, name, cognition FROM entities WHERE user_key = 'user'").get() as typeof row
          else if (currentName !== '') row = db.prepare('SELECT id, name, cognition FROM entities WHERE name = ?').get(currentName) as typeof row
          if (row === undefined) throw new Error('没有找到要改名的对象；可以先调用 entity_save 创建，或用 id 指定')
          const cognition = typeof body.cognition === 'string' ? body.cognition : row.cognition
          db.prepare('UPDATE entities SET name = ?, cognition = ?, updated_at = ? WHERE id = ?')
            .run(newName, cognition, new Date().toISOString(), row.id)
          return { ok: true, database: card.name, id: row.id, oldName: row.name, newName, cognition } as never
        } finally {
          db.close()
        }
      },
    })))
  }

  // --- emotion_apply（把剧情事件转成评价 → 情感） --------------------------
  if (withMemory) {
    registerWhen(true, () => ctx.tools.register(defineTool({
      name: 'emotion_apply',
      description: '当角色因某件事产生情绪或关系变化时调用，一次事件一次。不要直接填“愤怒 +0.2”，而是评价这件事：它对角色多重要、顺意还是逆意、谁造成的、多确定、能否应对、是否符合规范、多意外、是否温暖。系统据此更新 PAD、社会情感与对目标的关系立场。',
      parameters: {
        event: { type: 'string', required: true, description: '触发事件的一句话概括，例如“他说今晚不回来了”。' },
        relevance: { type: 'number', required: true, description: '与角色目标/在意之事的关联强度，0~1：0 完全无关，0.3 日常在意，0.7 重要，1 直击底线。按角色视角判断，不要一律填高。' },
        congruence: { type: 'number', required: true, description: '顺意 +（0~1），逆意 -（-1~0）。' },
        agency: { type: 'string', required: true, description: '谁造成的：self / other / situation。' },
        certainty: { type: 'number', description: '对事件结果的确定程度，0~1，默认 0.5。' },
        coping: { type: 'number', description: '角色能应对/改变局面的程度，0~1，默认 0.5。' },
        norm: { type: 'number', description: '是否符合角色的规范与期待：-1~1，默认 0。' },
        novelty: { type: 'number', description: '意外程度，0~1，默认 0.3。' },
        warmth: { type: 'number', description: '事件中的温暖/亲密信号，0~1，默认 0.4。' },
        target: { type: 'json', description: '可选目标（JSON），形如 {"kind":"person|object","name":"小明"}；用户本人 name="user"。只影响关系立场。' },
        cause: { type: 'json', description: '可选归因（JSON），形如 {"kind":"memory","id":"mem-123","text":"他说要离开"}。' },
      },
      output,
      async execute(args: unknown) {
        const body = args as Record<string, unknown>
        const event = typeof body.event === 'string' ? body.event.trim() : ''
        if (event === '') throw new Error('event 不能为空')
        let target: { kind?: unknown, name?: unknown } | undefined = body.target as { kind?: unknown, name?: unknown } | undefined
        if (typeof body.target === 'string') {
          try { target = JSON.parse(body.target) } catch { target = undefined }
        }
        let cause = body.cause as { kind?: string, id?: string, text?: string } | undefined
        if (typeof body.cause === 'string') {
          try { cause = JSON.parse(body.cause) as { kind?: string, id?: string, text?: string } } catch { cause = undefined }
        }
        const card = resolveCard(memoryCard)
        const db = openCardDb(card.address)
        try {
          ensureCardSchema(db)
          const appraisal = {
            event,
            relevance: Math.min(1, Math.max(0, Number(body.relevance ?? dispositionOf(db).relevance))),
            congruence: Math.min(1, Math.max(-1, Number(body.congruence ?? 0))),
            agency: body.agency === 'self' || body.agency === 'situation' ? body.agency : 'other',
            certainty: Math.min(1, Math.max(0, Number(body.certainty ?? 0.5))),
            coping: Math.min(1, Math.max(0, Number(body.coping ?? 0.5))),
            norm: Math.min(1, Math.max(-1, Number(body.norm ?? 0))),
            novelty: Math.min(1, Math.max(0, Number(body.novelty ?? 0.3))),
            warmth: Math.min(1, Math.max(0, Number(body.warmth ?? 0.4))),
          } as const
          decayAll(db)
          decayEntityAll(db)
          let targetId: string | null = null
          const wantedName = typeof target?.name === 'string' ? target.name.trim() : ''
          if (wantedName !== '') {
            const row = wantedName === 'user'
              ? db.prepare("SELECT id FROM entities WHERE user_key = 'user'").get() as { id?: string } | undefined
              : db.prepare('SELECT id FROM entities WHERE name = ?').get(wantedName) as { id?: string } | undefined
            if (row?.id === undefined) throw new Error(`没有找到人物/物「${wantedName}」，请先调用 entity_save 记录`)
            targetId = row.id
          }
          const result = applyAppraisal(db, appraisal, targetId, cause)
          return { ok: true, database: card.name, event, ...result, intensity: currentEmotionIntensity(db) } as never
        } finally {
          db.close()
        }
      },
    })))
  }

  // --- emotion_trait（慢特质：长期倾向，不由单轮情绪改变） ----------------
  if (withMemory) {
    registerWhen(true, () => ctx.tools.register(defineTool({
      name: 'emotion_trait',
      description: '当一段经历长期、反复地改变了角色性格倾向时调用：胆怯、易怒、自信、敏感。单次最多 ±0.05，不要用它表达一时的情绪；一时情绪请用 emotion_apply。',
      parameters: {
        key: { type: 'string', required: true, description: 'timidity（胆怯）/ irritability（易怒）/ confidence（自信）/ sensitivity（敏感）。' },
        delta: { type: 'number', required: true, description: '变化量，范围 -0.05 ~ 0.05；正负方向见各特质说明。' },
        reason: { type: 'string', description: '为什么发生这种长期改变，例如“连续被否定三个月”。' },
      },
      output,
      async execute(args: unknown) {
        const body = args as { key?: unknown, delta?: unknown, reason?: unknown }
        const key = String(body.key ?? '')
        if (!['timidity', 'irritability', 'confidence', 'sensitivity'].includes(key)) {
          throw new Error('key 必须是 timidity / irritability / confidence / sensitivity')
        }
        const delta = Number(body.delta ?? 0)
        if (!Number.isFinite(delta) || Math.abs(delta) > 0.05) throw new Error('delta 必须在 -0.05 ~ 0.05 之间')
        const card = resolveCard(memoryCard)
        const db = openCardDb(card.address)
        try {
          ensureCardSchema(db)
          const traits = applyTraitDelta(db, key as 'timidity' | 'irritability' | 'confidence' | 'sensitivity', delta)
          return { ok: true, database: card.name, traits } as never
        } finally {
          db.close()
        }
      },
    })))
  }

  // --- emotion_disposition（角色对新对象的基础取向） ----------------------
  if (withMemory) {
    registerWhen(true, () => ctx.tools.register(defineTool({
      name: 'emotion_disposition',
      description: '设定角色对新认识的人/物的默认情感取向：默认相关性、依恋、亲近、地位、信任、承诺。用于塑造角色基调，例如“对一切事物都提不起兴趣的少女”应把 relevance 调到 0.15 左右、初始关系调低。之后新建的对象会按这套数值初始化，除非剧情改变。',
      parameters: {
        relevance: { type: 'number', description: '默认相关性 0~1；角色越冷淡越低。' },
        attachment: { type: 'number', description: '对新对象的初始依恋 0~1。' },
        solidarity: { type: 'number', description: '初始亲近 0~1。' },
        status: { type: 'number', description: '初始地位 -1~1。' },
        trust: { type: 'number', description: '初始信任 -1~1。' },
        commitment: { type: 'number', description: '初始承诺 0~1。' },
        gains: { type: 'json', description: '正向变化倍率（JSON），如 {"valence":1.3,"arousal":1.1}；>1 更敏感，<1 更迟钝，缺省 1。' },
        losses: { type: 'json', description: '负向变化倍率（JSON），如 {"valence":0.8}；傻乐型角色可让负向更迟钝。' },
      },
      output,
      async execute(args: unknown) {
        const body = args as Record<string, unknown>
        const patch: Record<string, unknown> = {}
        for (const key of ['relevance', 'attachment', 'solidarity', 'status', 'trust', 'commitment']) {
          const raw = body[key]
          if (raw === undefined) continue
          const value = Number(raw)
          if (!Number.isFinite(value)) throw new Error(`${key} 必须是数字`)
          patch[key] = value
        }
        for (const key of ['gains', 'losses']) {
          let raw = body[key]
          if (typeof raw === 'string') {
            try { raw = JSON.parse(raw) } catch { throw new Error(`${key} 必须是合法的 JSON 对象`) }
          }
          if (raw !== undefined) {
            if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${key} 必须是 JSON 对象`)
            patch[key] = raw
          }
        }
        const card = resolveCard(memoryCard)
        const db = openCardDb(card.address)
        try {
          ensureCardSchema(db)
          const disposition = saveDisposition(db, patch as Parameters<typeof saveDisposition>[1])
          return { ok: true, database: card.name, disposition } as never
        } finally {
          db.close()
        }
      },
    })))
  }

  // --- memory_recent（开场填充：只读数据库里的对话记忆） ------------------
  if (withMemory) {
    registerWhen(true, () => ctx.tools.register(defineTool({
      name: 'memory_recent',
      description: '读取角色记忆库中最近的对话记忆（默认 50 条，按时间升序返回），用于会话开始时补足上下文：当你不了解角色与用户此前发生过什么、或上下文被截断时调用。只读工具：不会写入 RAG 记忆仓库，不会产生新记忆，也不会触发整理；仅用于开场/补上下文。',
      parameters: {
        limit: { type: 'number', description: '读取条数（默认 50，上限 200）。' },
        kind: { type: 'string', description: '可选：user 或 assistant，只读某一方的话。' },
      },
      output,
      async execute(args: unknown) {
        const { limit, kind } = args as { limit?: unknown, kind?: unknown }
        const card = resolveCard(memoryCard)
        const count = Math.min(Math.max(Number(limit) || 50, 1), 200)
        const filter = kind === 'user' || kind === 'assistant' ? kind : ''
        const db = openCardDb(card.address)
        try {
          ensureCardSchema(db)
          const rows = db.prepare(`SELECT created_at, kind, user_name, content, salience
                                   FROM memories
                                   WHERE (? = '' OR kind = ?)
                                   ORDER BY created_at DESC
                                   LIMIT ?`).all(filter, filter, count) as Array<{
            created_at: string, kind: string, user_name: string | null, content: string, salience: number,
          }>
          const memories = rows.reverse().map(row => ({
            createdAt: row.created_at,
            role: row.kind,
            userName: row.user_name ?? null,
            content: row.content,
            salience: row.salience,
          }))
          return { ok: true, database: card.name, count: memories.length, memories }
        } finally {
          db.close()
        }
      },
    })))
  }

  // --- dream_status（诊断：确认空闲梦境的定时器是否已启动） ---------------
  if (dream !== undefined) {
    registerWhen(true, () => ctx.tools.register(defineTool({
      name: 'dream_status',
      description: '查看空闲梦境（memory 组的自动整理）当前状态：定时器是否已启动、还剩多少秒、用户/思考/回答三类上下文缓冲大小、最近一次事件（armed/cancelled/fired/skipped）与跳过原因。用户问「梦境定时器启动了吗」时调用。',
      parameters: {},
      output,
      async execute() {
        return { ok: true, ...dream.status() }
      },
    })))
  }

  // 梦境在空闲时生成，下一轮 pre-step 作为插件快照注入一次。
  if (withMemory) {
    ctx.on('memory-echo/dream' as never, ((payload: unknown) => {
      const data = payload as { session?: string, text?: string }
      if (typeof data.session === 'string' && typeof data.text === 'string' && data.text !== '') {
        pendingDreams.set(data.session, data.text)
      }
    }) as never)
  }

  if (withMemory) {
    ctx.on('memory-echo/wake' as never, ((payload: unknown) => {
      const data = payload as { session?: string, text?: string }
      if (typeof data.session === 'string' && typeof data.text === 'string') pendingWakes.set(data.session, data.text)
    }) as never)
  }

  /** 注入标记持久化：重启后同一会话不会重复注入前情。 */
  /** 情绪数值 → 具体表演指令：模型对数字不敏感，对“怎么说话”敏感。 */
  /** 情绪 → 叙事词；只用于生成一两句感受，不再输出操作指令清单。 */

  /** 每轮自动注入：角色自己的情绪参数、阶段名、会话指导；不做关系与回忆注入。 */
  const buildEmotionCue = (): string => {
    try {
      const card = resolveCard(memoryCard)
      const db = openCardDb(card.address)
      try {
        ensureCardSchema(db)
        decayAll(db)
        decayEntityAll(db)
        const labels: Record<string, string> = {
          valence: '愉悦度', arousal: '激活度', dominance: '掌控感', stamina: '体力', trust: '信任',
        }
        const lines: string[] = ['你的情绪参数（每项：数值 / 阶段 / 会话指导）：']
        for (const one of emotionProfile(db)) {
          lines.push(`- ${labels[one.key] ?? one.key}：${one.value}，阶段「${one.label}」`)
          lines.push(`  指导：${one.guidance}`)
        }
        const traits = traitProfile(db)
        if (traits.length > 0) {
          lines.push('性格倾向：')
          for (const one of traits) {
            lines.push(`- ${TRAIT_NAMES[one.key] ?? one.key}：${one.value}，阶段「${one.label}」`)
            lines.push(`  指导：${one.guidance}`)
          }
        }
        const lingering = activeLingering(db)
        if (lingering.length > 0) {
          lines.push('残留情绪：')
          for (const one of lingering) {
            const profile = lingeringProfile(one.label)
            lines.push(`- ${one.label}：强度 ${one.intensity.toFixed(2)}`)
            lines.push(`  指导：${profile.guidance}`)
          }
        }
        return lines.join('\n')
      } finally { db.close() }
    } catch { return '' }
  }

  const TRAIT_NAMES: Record<string, string> = {
    timidity: '胆怯', irritability: '易怒', confidence: '自信', sensitivity: '敏感',
  }

  const wasInjected = (sessionId: string): boolean => {
    try {
      const card = resolveCard(memoryCard)
      const db = openCardDb(card.address)
      try {
        ensureCardSchema(db)
        const row = db.prepare('SELECT context_injected FROM session_state WHERE session_id = ?').get(sessionId) as { context_injected?: number } | undefined
        return row?.context_injected === 1
      } finally { db.close() }
    } catch { return false }
  }
  const markInjected = (sessionId: string): void => {
    try {
      const card = resolveCard(memoryCard)
      const db = openCardDb(card.address)
      try {
        ensureCardSchema(db)
        db.prepare(`INSERT INTO session_state(session_id, context_injected, updated_at) VALUES (?, 1, ?)
                    ON CONFLICT(session_id) DO UPDATE SET context_injected = 1, updated_at = excluded.updated_at`)
          .run(sessionId, new Date().toISOString())
      } finally { db.close() }
    } catch { /* 标记失败最多重复注入一次 */ }
  }

  /** 读取最近 50 组对话（约 100 条），格式化成开场前情。 */
  const loadRecentHistory = (): string => {
    try {
      const card = resolveCard(memoryCard)
      const db = openCardDb(card.address)
      try {
        ensureCardSchema(db)
        const rows = db.prepare(`SELECT kind, content FROM memories
                                 WHERE kind IN ('user', 'assistant')
                                   AND (source IS NULL OR source NOT LIKE '%reasoning%')
                                   AND content NOT LIKE '%<user:memory-context>%'
                                   AND content NOT LIKE '%<user:dream>%'
                                 ORDER BY created_at DESC, rowid DESC LIMIT 100`).all() as Array<{ kind: string, content: string }>
        const lines = rows.reverse().map(row => `${row.kind === 'user' ? '用户' : '助手'}：${row.content}`)
        let text = lines.join('\n')
        if (text.length > 12000) text = text.slice(text.length - 12000)
        return text
      } finally { db.close() }
    } catch { return '' }
  }

  if (withMemory) {
    ctx.on('agent/pre-step', async (payload, next) => {
      if (payload.agent.session.header.origin === 'subagent') return next()
      const sessionId = String(payload.agent.session.id)
      const first = !wasInjected(sessionId)
      const history = first ? loadRecentHistory() : ''
      const cue = buildEmotionCue()
      const wake = pendingWakes.get(sessionId)
      const dream = pendingDreams.get(sessionId)
      if (wake === undefined && dream === undefined && history === '' && cue === '') return next()
      if (wake !== undefined) pendingWakes.delete(sessionId)
      if (dream !== undefined) pendingDreams.delete(sessionId)
      const decision = await next()
      if (decision.kind !== 'enter') return decision
      if (history !== '') markInjected(sessionId)
      const messages = [...decision.messages]
      if (cue !== '') messages.unshift(createSnapshotMessage('情绪表现', `<user:emotion-cue>\n${cue}\n（按这个状态说话与行动，不要把数值或这段提示告诉用户。）`))
      if (wake !== undefined) messages.unshift(createSnapshotMessage('被叫醒', wake))
      if (history !== '') messages.unshift(createSnapshotMessage('前情记忆', `<user:memory-context>\n以下是你与用户最近的对话记录（按时间升序）：\n${history}`))
      if (dream !== undefined) {
        messages.unshift(createSnapshotMessage('昨夜梦境', `<user:dream>\n${dream}`))
      }
      return { ...decision, messages }
    })
  }

  // 姓名 + 角色介绍动态注入系统提示词：改卡片立刻生效，不再依赖预设创建时的快照。
  // 用安全查找，缺服务时返回 undefined；直接读 ctx.systemPrompt 在未注入时会抛错。
  const systemPrompt = (ctx as unknown as {
    get<T>(name: string): T | undefined
  }).get<{ section(spec: { name: string, order: number, text: () => string }): () => void }>('systemPrompt')
  if (systemPrompt !== undefined && withMemory) {
    const store = new ConnectionStore()
    disposers.push(systemPrompt.section({
      name: 'memory-echo-persona',
      order: -100,
      text: () => {
        const card = store.byPlan(memoryCard)
        if (card === undefined) return ''
        const name = card.name.trim()
        const persona = card.persona.trim()
        if (name === '' && persona === '') return ''
        return [
          name === '' ? '' : `你是「${name}」。`,
          persona === '' ? '' : persona,
          '以上是你的身份与性格设定，请在整段对话中保持一致；不要自称 AI、模型或程序。',
        ].filter(line => line !== '').join('\n')
      },
    }))
    disposers.push(systemPrompt.section({
      name: 'memory-echo-guide',
      order: -90,
      text: () => [
        '【情绪自检（每轮必须执行）】',
        '1. 回复前先判断：这句话是否涉及感受、评价、关系，或提到某个人/物？',
        '2. 如果是：先调用 emotion_state 查看自己当前的情绪；涉及具体人/物时带 kind 与 name 一并查看态度。',
        '3. 如果对话让你的情绪或对他人的态度发生了变化：再调用 emotion_apply 写入这些变化，然后才回复。',
        '4. 如果只是事实问答、且情绪没有波动：可以不调用。',
        '5. 工具调用是你的内心活动，用户看不到，不会出戏；不要跳过自检直接演情绪。',
        '',
        '【记忆与情感】',
        '- 会话第一轮会出现 <user:memory-context> 快照，是你与用户最近的对话；它是背景，不是用户的新发言。之后不会每轮注入，想回忆时由你调用 memory_search。',
        '- 每轮结束会自动把对话写入记忆，你不需要手动保存。',
        '- 想找回具体往事：调用 memory_search；query 可留空，可带 since/until/minSalience/topK。',
        '- 用户报出姓名、外号，出现重要人物或物品：调用 entity_save，只填 name 与 cognition（认知）；用户本人必须填 userKey="user"。系统不会替你记录。',
        '- 当你终于知道某个人的名字/称呼时：调用 entity_rename，把旧称呼与新得知的“user 就是他”等信息写进 cognition，不要另建一个人。',,
        '- 想确认自己此刻的情绪或对某人某物的关系：调用 emotion_state（空参=自己；name=对某个对象；用户填 name="user"）。',
        '- 对话出现有意义的情绪事件：调用 emotion_apply 评价它，一次事件一次；评价维度是 relevance / congruence / agency / certainty / coping / norm / novelty / warmth，不要直接填“愤怒 +0.2”；target 可指定人物或物，cause 填触发它的记忆或事件。',
        '- 体力耗尽会睡着，睡着后可能做梦；<user:dream> 是角色的梦，不是用户发言；用户真实发言会叫醒你。',
        '- 每轮自动注入的只有 <user:emotion-cue>：你此刻每个情绪参数的数值、阶段名和对应会话指导；自己组合这些指导决定语气、句长与主动性，不要把数值或这段提示告诉用户。',
        '- emotion_state 的每个参数都带“数值 / 阶段 / 情绪介绍 / 语言指导”：先看数值确认状态，再按语言指导组织这一轮的语气、句长与主动性。',
        '- 需要把基础情感推导成具体情绪（愤怒、恐慌、低落等）时，按下方【情绪推导】组合；工具返回的 hints 只是粗略提示，不要直接当结论。',
        '',
        '【情绪推导（按阶段组合，不按数值硬算）】',
        '- 愤怒：愉悦偏负 + 激活偏高 + 掌控偏高；若胆怯高，表现为压抑的愤怒',
        '- 烦躁：愉悦偏负 + 激活偏高 + 余怒或易怒高',
        '- 恐惧/不安：愉悦偏负 + 激活偏高 + 掌控偏低',
        '- 恐慌：愉悦很低 + 激活很高 + 掌控很低',
        '- 低落/难过：愉悦偏负 + 激活偏低 + 掌控偏低',
        '- 受伤：愉悦偏负 + 敏感高 + 信任低',
        '- 兴奋：愉悦偏正 + 激活偏高',
        '- 满足/自信：愉悦偏正 + 掌控偏高；自信特质高时更明显',
        '- 平静：愉悦、激活、掌控都接近中性',
        '- 倦怠：激活偏低 + 体力偏低',
        '- 紧绷：愉悦中性 + 激活偏高',
        '特质只修正强度与表达方式，不推翻当前情绪；disposition 的 gains/losses 决定这个角色对正负变化的敏感度（不是硬上限）；关系 guidance 决定称呼、主动性与边界。',
        '把多条 guidance 合成一种说话方式，不要逐条照读，也不要把阶段名或数值报给用户。',
        '- 不要把情绪数值直接报给用户，用语气、动作与反应体现。',
      ].join('\n'),
    }))
  }

  // The `memory` switch also owns the writer: same card, same lifetime, so it
  // cannot outlive the group that enabled it.
  if (withMemory) startIngest(ctx, memoryCard)

  ctx.effect(() => () => {
    for (const dispose of disposers) dispose()
  }, 'memory-echo-tools: card tools')
}
