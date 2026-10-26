/**
 * Memory-recall host seam: the RAG connection card registry exposed as the
 * `memory-echo` remote namespace. The embedding dependency is lazy
 * (`ctx.get`) and read-only (`listModels`) on purpose: cards are pure
 * configuration — create/list/edit/delete keep working when the local
 * embedding plugin is disabled, and the model picker just shows an empty
 * catalog with a hint.
 *
 * Every method takes and returns plain JSON values, so the hand-written
 * Typert manifest (lib/typert.host.js) carries one reusable codec.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { Context } from '@deepseek-ai/cordis'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import zschema from '@deepseek-ai/schemastery'
import { ConnectionStore, dataRoot, localDatabaseDir, migrateLegacyCards, validate, type ConnectionFault } from './connections.ts'
import { ensureCardSchema, openCardDb, readCard } from './card-db.ts'
import { activeLingering, applyAppraisal, decayAll, decayEntityAll, currentEmotionIntensity, dispositionOf, emotionProfile, initialRelationship, logEmotionChange, saveDisposition, traitProfile, type Appraisal } from './emotion.ts'
import { backfillMemories, cleanupReasoningMemories } from './backfill.ts'
import { parse as parseYaml } from 'yaml'

const RELATION_KEYS = ['solidarity', 'status', 'trust', 'commitment']
const PERSON_ATTITUDES = RELATION_KEYS
const OBJECT_ATTITUDES = RELATION_KEYS

import { readdirSync } from 'node:fs'
import { listChunks, listDreams, queryLocal } from './query.ts'

/** Shared with the toolset package: it opens the same cards this controller manages. */
export { ConnectionStore, dataRoot, localDatabaseDir, migrateLegacyCards } from './connections.ts'
export { ensureCardSchema, openCardDb } from './card-db.ts'
export { activeLingering, applyAppraisal, applyTraitDelta, traitProfile, TRAIT_KEYS, type TraitKey, type TraitProfile, currentEmotionIntensity, decayAll, decayEntityAll, derivedEmotionLabels, dispositionOf, emotionProfile, initialRelationship, sensitivityOf, lingeringProfile, relationshipProfile, saveDisposition, stageIndex, stageLabel, valenceLevel, VALENCE_LEVELS, type Appraisal, type LingeringEntry, type Disposition, type ParameterProfile, type Stage } from './emotion.ts'
export { dedupeDreams, dedupeMemories } from './consolidate.ts'
export { backfillMemories } from './backfill.ts'
export type { ConnectionFault, ConnectionInput, ConnectionRecord } from './connections.ts'
export { clearChunks, deleteByContent, ensureLocalDatabase, insertChunks, listChunks, listDreams, openDb, queryLocal } from './query.ts'
export type { ChunkInput, ChunkMeta, DeleteOutcome, DreamEntry, QueryHit, RecallRow, WriteFault } from './query.ts'
export { countTopic, expandAdjacent, scoreRows, topicWeight, weightedFrequency } from './recall.ts'
export type { ExpandOptions, ScoredRow } from './recall.ts'

export const name = 'memory-api'


/** The schema class instance type, nameable without dragging cosmokit in. */
type SchemaNode = InstanceType<typeof zschema>

/**
 * No runtime settings surface of our own (v1); the schema stays because the
 * loader always mounts one.
 */
export const Config = zschema.object({}) as unknown as SchemaNode

/** Plain-object projection for the wire: drops undefined fields. */
const asJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

/** Lazy service lookups the controller performs per call. */
interface HostContext {
  get<T = unknown>(name: string): T | undefined
}

/** Map a registry fault onto the wire vocabulary. */
function fault(error: ConnectionFault): RemoteError {
  switch (error.code) {
    case 'plan-required':
      return new RemoteError('memory-echo/invalid-input', '方案名称不能为空', {})
    case 'plan-invalid':
      return new RemoteError('memory-echo/invalid-input', '方案名称只能是小写字母、数字与连字符（2~32 位）', {})
    case 'plan-duplicate':
      return new RemoteError('memory-echo/name-duplicate', `方案名称已存在：${error.name}`, { name: error.name })
    case 'name-required':
      return new RemoteError('memory-echo/invalid-input', '名称不能为空', {})
    case 'address-required':
      return new RemoteError('memory-echo/invalid-input', '数据库地址不能为空', {})
    case 'embedding-required':
      return new RemoteError('memory-echo/invalid-input', '请选择 embedding 引擎', {})
  }
}

/**
 * Host service backing the generated `ctx.remote['memory-echo']` namespace.
 * @typert service memoryEchoController
 */
export class MemoryRecallController extends TypertRemoteService {
  private store = new ConnectionStore()

  constructor(ctx: Context) {
    super(ctx, 'memoryEchoController', { namespace: 'memory-echo' })
  }

  /** One lazy optional-service lookup, untyped at the boundary. */
  private svc<T>(name: string): T | undefined {
    return (this.ctx as unknown as HostContext).get<T>(name)
  }

  /** 现有工作区列表（供卡片下拉选择）。 */
  @Remote
  async workspaceOptions(): Promise<JsonValue> {
    const svc = this.svc<Record<string, unknown>>('workspaceRegistry') ?? this.svc<Record<string, unknown>>('workspaces')
    let list: unknown[] = []
    try {
      for (const method of ['list', 'roots', 'all', 'entries']) {
        const fn = svc?.[method]
        if (typeof fn === 'function') {
          const value = await (fn as () => unknown).call(svc)
          if (Array.isArray(value)) { list = value; break }
        }
      }
    } catch { /* 服务形状不符时返回空列表 */ }
    return asJson({
      workspaces: list.map(item => {
        const one = item as Record<string, unknown>
        return {
          id: String(one.id ?? one.path ?? ''),
          name: String(one.title ?? one.name ?? one.path ?? ''),
          cwd: String(one.path ?? one.cwd ?? ''),
        }
      }).filter(one => one.cwd !== '' || one.id !== ''),
    })
  }

  /** 现有 agent 预设列表（供卡片选择基础预设）。 */
  @Remote
  async presetOptions(): Promise<JsonValue> {
    const presets = this.svc<{
      list(): Promise<Array<{ id: string, name?: string, description?: string, broken?: string }>>
      resolve(id?: string): Promise<{ id: string, name?: string, broken?: string }>
      compositionInventory?(): Promise<Array<{ id: string, broken?: string, rows?: unknown[] }>>
    }>('agentPresets')
    let roster: Array<{ id: string, name?: string, description?: string, broken?: string }> = []
    try { roster = await presets?.list() ?? [] } catch { /* 服务未就绪 */ }
    const own = new Set(this.store.list().map(card => card.plan))
    const listed: Array<{ id: string, name: string, reason?: string }> = []
    // 用 resolve 判定“当前能否真正组建会话”，而不是靠名字过滤。
    for (const one of roster) {
      if (typeof one.id !== 'string' || one.id === '') continue
      if (own.has(one.id)) continue
      let reason: string | undefined = typeof one.broken === 'string' && one.broken !== '' ? one.broken : undefined
      if (reason === undefined) {
        try {
          const resolved = await presets?.resolve(one.id)
          if (resolved !== undefined && typeof resolved.broken === 'string' && resolved.broken !== '') reason = resolved.broken
        } catch (error) {
          reason = error instanceof Error ? error.message : String(error)
        }
      }
      if (reason !== undefined) continue
      listed.push({ id: one.id, name: one.name ?? one.id })
    }
    try {
      writeFileSync(join(dataRoot(), 'preset-options.json'), `${JSON.stringify({ at: new Date().toISOString(), roster, presetsList: listed }, null, 2)}\n`)
    } catch { /* 诊断文件失败不影响返回 */ }
    return asJson({ presets: listed.map(one => ({ id: one.id, name: one.name })) })
  }

  /** 在系统文件管理器中定位数据库文件。 */
  @Remote
  async openDatabaseLocation(input: JsonValue): Promise<JsonValue> {
    const { id } = input as { id?: string }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    try {
      if (process.platform === 'darwin') spawn('open', ['-R', card.address], { detached: true, stdio: 'ignore' }).unref()
      else spawn(process.platform === 'win32' ? 'explorer' : 'xdg-open', [card.address], { detached: true, stdio: 'ignore' }).unref()
    } catch {
      throw new RemoteError('memory-echo/invalid-input', '无法打开数据库位置', {})
    }
    return asJson({ path: card.address })
  }

  /** 创建角色会话：把 seed / 库最近片段作为会话创建时的初始历史。 */
  @Remote
  async createCharacterSession(input: JsonValue): Promise<JsonValue> {
    const body = input as { plan?: unknown }
    const plan = typeof body.plan === 'string' ? body.plan.trim().toLowerCase() : ''
    const card = this.store.byPlan(plan)
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: plan })
    const sessions = this.svc<{ create(id?: string, options?: Record<string, unknown>): { id: string } }>('sessions')
    if (sessions === undefined) throw new RemoteError('memory-echo/invalid-input', '会话服务尚未就绪', {})

    // 只从 RAG 记忆库取：卡片 seed 需要现在设置页手动「入库」。
    const recent = (() => {
      const rows = listChunks(card.address)
      if (rows.length === 0) return [] as SeedLine[]
      const sorted = [...rows].sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)) || b.id - a.id)
      const out: SeedLine[] = []
      let chars = 0
      for (const row of sorted) {
        if (out.length >= 6 && chars + row.content.length > 6000) break
        out.push({ role: row.kind === 'assistant' ? 'assistant' : 'user', text: row.content })
        chars += row.content.length
      }
      return out.reverse()
    })()
    // 空库只警告，不阻断：仍创建一个空会话。
    const warning = recent.length === 0 ? '记忆库为空：请先在卡片设置中执行「入库」，再开始会话。' : undefined
    const now = Date.now()
    const seed = recent.map((line, index) => {
      if (line.role === 'user') {
        return {
          type: 'user/message', seq: index, time: now + index, surfaceOp: 'append',
          data: createUserMessage({ content: [{ type: 'text', text: line.text }], source: { kind: 'user' } }),
        }
      }
      return {
        type: 'assistant/message', seq: index, time: now + index, surfaceOp: 'append',
        data: {
          turn: 1, step: 1,
          message: (createAssistantMessage as unknown as (input: unknown) => unknown)({ content: [{ type: 'text', text: line.text }], source: { provider: '', model: '' } }),
          stream: [],
        },
      }
    })
    const created = sessions.create(undefined, { seed, meta: { agentPreset: plan } })
    return asJson({ sessionId: created.id, plan, lines: seed.length, ...(warning === undefined ? {} : { warning }) })
  }

  /** 读取最近的梦（来自向量库 kind='dream'），供设置页回顾。 */
  @Remote
  async dreamList(input: JsonValue): Promise<JsonValue> {
    const { id, limit } = input as { id?: string, limit?: number }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    const count = Math.min(Math.max(Number(limit) || 20, 1), 100)
    await Promise.resolve()
    const dreams = listDreams(card.address, count).map(one => ({ rowid: one.rowid, content: one.content, addedAt: one.addedAt, source: one.source }))
    return asJson({ dreams })
  }

  /** 列出本地 databases 目录下可载入的数据库文件。 */
  @Remote
  async databaseFiles(): Promise<JsonValue> {
    const dir = localDatabaseDir()
    const files = readdirSync(dir).filter(name => name.endsWith('.sqlite')).map(name => {
      const address = join(dir, name)
      const card = readCard(address)
      return { address, name, plan: name.replace(/\.sqlite$/u, ''), title: card?.name ?? '' }
    })
    return asJson({ files })
  }

  /** 读取指定数据库的人物内容（姓名/角色介绍）。 */
  @Remote
  async loadDatabase(input: JsonValue): Promise<JsonValue> {
    const { address } = input as { address?: string }
    if (typeof address !== 'string' || address === '') throw new RemoteError('memory-echo/invalid-input', '数据库地址不能为空', {})
    const card = readCard(address)
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '数据库不存在或无法读取', { id: address })
    return asJson(card)
  }

  /** 读取角色的情感基调与增减系数。 */
  @Remote
  async cardDisposition(input: JsonValue): Promise<JsonValue> {
    const { id } = input as { id?: string }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    const db = openCardDb(card.address)
    try {
      ensureCardSchema(db)
      return asJson(dispositionOf(db))
    } finally { db.close() }
  }

  /** 修改情感基调 / 增减系数（只传想改的键）。 */
  @Remote
  async setCardDisposition(input: JsonValue): Promise<JsonValue> {
    const { id, patch } = input as { id?: string, patch?: Record<string, unknown> }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    if (patch === undefined || typeof patch !== 'object') throw new RemoteError('memory-echo/invalid-input', 'patch 必须是对象', {})
    const db = openCardDb(card.address)
    try {
      ensureCardSchema(db)
      return asJson(saveDisposition(db, patch))
    } finally { db.close() }
  }

  /** 修改己状态中的某一维度（0~1 浮点）。 */
  @Remote
  async setSelfState(input: JsonValue): Promise<JsonValue> {
    const { id, key, value } = input as { id?: string, key?: string, value?: unknown }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    if (typeof key !== 'string' || key === '') throw new RemoteError('memory-echo/invalid-input', '状态键不能为空', {})
    const number = Number(value)
    if (!Number.isFinite(number)) throw new RemoteError('memory-echo/invalid-input', '状态值必须是数字', {})
    const signed = key === 'valence' || key === 'arousal' || key === 'dominance' || key === 'trust'
    const bounded = Math.min(1, Math.max(signed ? -1 : 0, number))
    const db = openCardDb(card.address)
    ensureCardSchema(db)
    try {
      const before = (db.prepare('SELECT value FROM self_state WHERE key = ?').get(key) as { value?: number } | undefined)?.value
      db.prepare('INSERT INTO self_state(key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
        .run(key, bounded, new Date().toISOString())
      if (before !== undefined) {
        logEmotionChange(db, { scope: 'self', param: key, before, delta: bounded - before, after: bounded, reason: 'manual' })
      }
    } finally {
      db.close()
    }
    return asJson({ key, value: bounded })
  }

  /** 情绪变动日志（最近的在前）。 */
  @Remote
  async emotionChangeLog(input: JsonValue): Promise<JsonValue> {
    const { id, limit } = input as { id?: string, limit?: unknown }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    const count = Math.min(Math.max(Number(limit) || 100, 1), 500)
    const db = openCardDb(card.address)
    ensureCardSchema(db)
    try {
      const rows = db.prepare(`SELECT ts, scope, entity_name, param, before, delta, after, reason, cause_kind, cause_text, message
                               FROM emotion_change_log ORDER BY ts DESC, rowid DESC LIMIT ?`).all(count)
      return asJson({ rows })
    } finally { db.close() }
  }

  /** 列出人/物（含态度），query 按名称/别名过滤。 */
  @Remote
  async listEntities(input: JsonValue): Promise<JsonValue> {
    const { id, query } = input as { id?: string, query?: string }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    const db = openCardDb(card.address)
    ensureCardSchema(db)
    try {
      const like = `%${(query ?? '').trim()}%`
      const rows = db.prepare('SELECT id, name, cognition FROM entities WHERE name LIKE ? OR cognition LIKE ? ORDER BY name').all(like, like)
      const initial = initialRelationship(db)
      const stamp = new Date().toISOString()
      for (const row of rows as Array<{ id: string }>) {
        for (const key of PERSON_ATTITUDES) {
          db.prepare('INSERT OR IGNORE INTO entity_state(entity_id, key, value, updated_at) VALUES (?, ?, ?, ?)')
            .run(row.id, key, initial[key] ?? 0.5, stamp)
        }
      }
      const states = db.prepare('SELECT entity_id, key, value FROM entity_state').all() as Array<{ entity_id: string, key: string, value: number }>
      return asJson({
        rows: (rows as Array<Record<string, unknown>>).map(row => ({
          ...row,
          attitudes: states.filter(state => state.entity_id === row.id).map(state => ({ key: state.key, value: state.value })),
        })),
      })
    } finally { db.close() }
  }

  /** 新增/更新一条人/物。 */
  @Remote
  async saveEntity(input: JsonValue): Promise<JsonValue> {
    const { id, kind, entity } = input as { id?: string, kind?: string, entity?: Record<string, unknown> }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    const name = typeof entity?.name === 'string' ? entity.name.trim() : ''
    const cognition = typeof entity?.cognition === 'string' ? entity.cognition : typeof entity?.description === 'string' ? entity.description : ''
    if (name === '') throw new RemoteError('memory-echo/invalid-input', '名称不能为空', {})
    const entityId = typeof entity?.id === 'string' && entity.id !== '' ? entity.id : randomUUID()
    const now = new Date().toISOString()
    const db = openCardDb(card.address)
    ensureCardSchema(db)
    try {
      db.prepare(`INSERT INTO entities(id, name, cognition, updated_at)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET name=excluded.name, cognition=excluded.cognition, updated_at=excluded.updated_at`)
        .run(entityId, name, cognition, now)
      const attitudeKeys = kind === 'object' ? OBJECT_ATTITUDES : PERSON_ATTITUDES
      const initial = initialRelationship(db)
      for (const key of attitudeKeys) {
        db.prepare('INSERT OR IGNORE INTO entity_state(entity_id, key, value, updated_at) VALUES (?, ?, ?, ?)')
          .run(entityId, key, initial[key] ?? 0.5, now)
      }
    } finally { db.close() }
    return asJson({ id: entityId })
  }

  /** 删除一条人/物及其态度。 */
  @Remote
  async deleteEntity(input: JsonValue): Promise<JsonValue> {
    const { id, entityId } = input as { id?: string, entityId?: string }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    const db = openCardDb(card.address)
    ensureCardSchema(db)
    try {
      db.prepare('DELETE FROM entities WHERE id = ?').run(entityId ?? '')
      db.prepare('DELETE FROM entity_state WHERE entity_id = ?').run(entityId ?? '')
    } finally { db.close() }
    return asJson({ ok: true })
  }

  /** 修改某人/物某个态度维度的值。 */
  @Remote
  async setEntityState(input: JsonValue): Promise<JsonValue> {
    const { id, entityId, key, value } = input as { id?: string, entityId?: string, key?: string, value?: unknown }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    const signed = key === 'status' || key === 'trust'
    const number = Math.min(1, Math.max(signed ? -1 : 0, Number(value)))
    if (typeof entityId !== 'string' || typeof key !== 'string' || !Number.isFinite(number)) {
      throw new RemoteError('memory-echo/invalid-input', '参数不合法', {})
    }
    const db = openCardDb(card.address)
    ensureCardSchema(db)
    try {
      const before = (db.prepare('SELECT value FROM entity_state WHERE entity_id = ? AND key = ?').get(entityId, key) as { value?: number } | undefined)?.value
      db.prepare('INSERT INTO entity_state(entity_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(entity_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
        .run(entityId, key, number, new Date().toISOString())
      if (before !== undefined) {
        const name = (db.prepare('SELECT name FROM entities WHERE id = ?').get(entityId) as { name?: string } | undefined)?.name ?? null
        logEmotionChange(db, { scope: 'entity', entityId, entityName: name, param: key, before, delta: number - before, after: number, reason: 'manual' })
      }
    } finally { db.close() }
    return asJson({ key, value: number })
  }

  /** 应用一次评价并记录归因（同一事务）。 */
  @Remote
  async emotionApply(input: JsonValue): Promise<JsonValue> {
    const body = input as { id?: string, appraisal?: unknown, targetId?: string, cause?: Record<string, unknown> }
    const card = this.store.get(body.id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: body.id ?? '' })
    const raw = (typeof body.appraisal === 'string' ? JSON.parse(body.appraisal) : body.appraisal) as Partial<Appraisal> | undefined
    if (raw === undefined || typeof raw !== 'object') throw new RemoteError('memory-echo/invalid-input', '缺少评价 appraisal', {})
    const appraisal: Appraisal = {
      event: typeof raw.event === 'string' ? raw.event : undefined,
      relevance: Number(raw.relevance ?? 0),
      congruence: Number(raw.congruence ?? 0),
      agency: raw.agency === 'self' || raw.agency === 'situation' ? raw.agency : 'other',
      certainty: Number(raw.certainty ?? 0.5),
      coping: Number(raw.coping ?? 0.5),
      norm: Number(raw.norm ?? 0),
      novelty: Number(raw.novelty ?? 0.3),
      warmth: Number(raw.warmth ?? 0.4),
    }
    const db = openCardDb(card.address)
    ensureCardSchema(db)
    try {
      decayAll(db)
      decayEntityAll(db)
      const cause = {
        kind: typeof body.cause?.kind === 'string' ? body.cause.kind : 'system',
        id: typeof body.cause?.id === 'string' ? body.cause.id : undefined,
        text: typeof body.cause?.text === 'string' ? body.cause.text : undefined,
        source: typeof body.cause?.source === 'string' ? body.cause.source : 'tool',
      }
      const result = applyAppraisal(db, appraisal, typeof body.targetId === 'string' ? body.targetId : null, cause)
      return asJson({ ...result, intensity: currentEmotionIntensity(db) })
    } finally { db.close() }
  }

  /** 当前情绪（已惰性衰减）+ 最近归因事件。 */
  @Remote
  async emotionState(input: JsonValue): Promise<JsonValue> {
    const { id } = input as { id?: string }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    const db = openCardDb(card.address)
    ensureCardSchema(db)
    try {
      decayAll(db)
      const state = db.prepare('SELECT key, value, baseline, floor, ceiling, updated_at FROM self_state ORDER BY key').all()
      const events = db.prepare('SELECT emotion, delta, value_after, cause_kind, cause_id, cause_text, ts FROM emotion_event ORDER BY ts DESC LIMIT 20').all()
      const changes = db.prepare('SELECT ts, scope, entity_name, param, before, delta, after, reason, cause_kind, cause_text, message FROM emotion_change_log ORDER BY ts DESC, rowid DESC LIMIT 50').all()
      return asJson({ state, events, changes })
    } finally { db.close() }
  }

  /**
   * 由数据库里的情绪数据派生极端/二次元情绪标签（只读、规则推导）。
   * 标签不是存储值，随时可按当前数值重算。
   */
  @Remote
  async emotionTags(input: JsonValue): Promise<JsonValue> {
    const { id } = input as { id?: string }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    const db = openCardDb(card.address)
    ensureCardSchema(db)
    try {
      const state = Object.fromEntries((db.prepare('SELECT key, value FROM self_state').all() as Array<{ key: string, value: number }>).map(row => [row.key, row.value]))
      const persons = db.prepare('SELECT id, name FROM entities').all() as Array<{ id: string, name: string }>
      const states = db.prepare('SELECT entity_id, key, value FROM entity_state').all() as Array<{ entity_id: string, key: string, value: number }>
      const selfTags: string[] = []
      if ((state['valence'] ?? 0) <= -0.5 && (state['arousal'] ?? 0) >= 0.6) selfTags.push('情绪激烈')
      if ((state['anger'] ?? 0) >= 0.6) selfTags.push('明显愤怒')
      if ((state['fear'] ?? 0) >= 0.6) selfTags.push('明显不安')
      if ((state['sadness'] ?? 0) >= 0.6) selfTags.push('明显低落')
      if ((state['dominance'] ?? 0) >= 0.6) selfTags.push('掌控感强')
      const personTags = persons.map(person => {
        const values = Object.fromEntries(states.filter(row => row.entity_id === person.id).map(row => [row.key, row.value]))
        const tags: string[] = []
        if ((values['attachment'] ?? 0) >= 0.8) tags.push('非常依恋')
        if ((values['solidarity'] ?? 0) >= 0.8) tags.push('亲近')
        if ((values['solidarity'] ?? 1) <= 0.2) tags.push('疏远')
        if ((values['trust'] ?? 0) <= 0.2) tags.push('不信任')
        if ((values['status'] ?? 0) >= 0.8) tags.push('占上风')
        if ((values['commitment'] ?? 0) >= 0.8) tags.push('认定')
        return { id: person.id, name: person.name, tags }
      })
      return asJson({ self: selfTags, persons: personTags })
    } finally { db.close() }
  }

  /** 列出记忆（不含向量），query 按正文过滤。 */
  @Remote
  async listMemories(input: JsonValue): Promise<JsonValue> {
    const { id, query, limit } = input as { id?: string, query?: string, limit?: number }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    const db = openCardDb(card.address)
    try {
      const rows = db.prepare('SELECT id, kind, user_name, content, created_at, salience, source FROM memories WHERE content LIKE ? ORDER BY created_at DESC, rowid DESC LIMIT ?')
        .all(`%${(query ?? '').trim()}%`, Math.min(Math.max(Number(limit) || 100, 1), 500))
      // 取最近 N 条后按时间正序返回，读起来像对话；同一轮内保持插入顺序。
      return asJson({ rows: rows.reverse() })
    } finally { db.close() }
  }

  /** 新增一条记忆（暂不写入向量）。 */
  @Remote
  async addMemory(input: JsonValue): Promise<JsonValue> {
    const { id, kind, content, salience } = input as { id?: string, kind?: string, content?: string, salience?: number }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    const text = typeof content === 'string' ? content.trim() : ''
    if (text === '') throw new RemoteError('memory-echo/invalid-input', '记忆内容不能为空', {})
    const memoryId = randomUUID()
    const db = openCardDb(card.address)
    try {
      db.prepare('INSERT INTO memories(id, kind, user_name, content, created_at, salience, source) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(memoryId, kind === 'assistant' ? 'assistant' : 'user', kind === 'assistant' ? null : 'user', text, new Date().toISOString(), Math.min(1, Math.max(0, Number(salience) || 0.5)), 'manual')
    } finally { db.close() }
    return asJson({ id: memoryId })
  }

  /** 删除一条记忆（含向量行，若存在）。 */
  @Remote
  async deleteMemory(input: JsonValue): Promise<JsonValue> {
    const { id, memoryId } = input as { id?: string, memoryId?: string }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    const db = openCardDb(card.address)
    try { db.prepare('DELETE FROM memories WHERE id = ?').run(memoryId ?? '') } finally { db.close() }
    return asJson({ ok: true })
  }

  /** 读取卡片库里的己状态与物（含态度维度），供设置页表格展示。 */
  @Remote
  async cardState(input: JsonValue): Promise<JsonValue> {
    const { id } = input as { id?: string }
    const card = this.store.get(id ?? '')
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: id ?? '' })
    const db = openCardDb(card.address)
    ensureCardSchema(db)
    decayAll(db)
    decayEntityAll(db)
    try {
      const selfState = db.prepare('SELECT key, value FROM self_state ORDER BY key').all() as Array<{ key: string, value: number }>
      const persons = db.prepare('SELECT id, name, cognition FROM entities ORDER BY name').all() as Array<{ id: string, name: string, aliases: string, description: string }>
      const objects: Array<{ id: string, name: string, category: string, description: string }> = [] as Array<{ id: string, name: string, category: string, description: string }>
      const states = db.prepare('SELECT entity_id, key, value FROM entity_state').all() as Array<{ entity_id: string, key: string, value: number }>
      const sleepRows = db.prepare('SELECT session_id, wake_at FROM sleep_state WHERE sleeping = 1').all() as Array<{ session_id: string, wake_at: string | null }>
      const stateMap = Object.fromEntries(selfState.map(row => [row.key, row.value]))
      const selfTags: string[] = []
      if ((stateMap['valence'] ?? 0) <= -0.5 && (stateMap['arousal'] ?? 0) >= 0.6) selfTags.push('情绪激烈')
      if ((stateMap['anger'] ?? 0) >= 0.6) selfTags.push('明显愤怒')
      if ((stateMap['fear'] ?? 0) >= 0.6) selfTags.push('明显不安')
      if ((stateMap['sadness'] ?? 0) >= 0.6) selfTags.push('明显低落')
      if ((stateMap['dominance'] ?? 0) >= 0.8) selfTags.push('掌控感强')
      const lingering = activeLingering(db)
      const personTags = persons.map(person => {
        const values = Object.fromEntries(states.filter(row => row.entity_id === person.id).map(row => [row.key, row.value]))
        const tags: string[] = []
        if ((values['attachment'] ?? 0) >= 0.8) tags.push('非常依恋')
        if ((values['solidarity'] ?? 0) >= 0.8) tags.push('亲近')
        if ((values['solidarity'] ?? 1) <= 0.2) tags.push('疏远')
        if ((values['trust'] ?? 0) <= 0.2) tags.push('不信任')
        if ((values['status'] ?? 0) >= 0.8) tags.push('占上风')
        if ((values['commitment'] ?? 0) >= 0.8) tags.push('认定')
        return { id: person.id, name: person.name, tags }
      })
      return asJson({
        sleep: sleepRows.map(row => ({ session: row.session_id, wakeAt: row.wake_at })),
        selfTags,
        personTags,
        selfState: selfState.map(row => ({ key: String(row.key), value: Number(row.value) })),
        parameters: emotionProfile(db),
        traits: traitProfile(db),
        lingering: lingering.map(row => ({ label: row.label, intensity: row.intensity, expiresAt: row.expires_at })),
        persons: persons.map(row => ({
          id: String(row.id),
          name: String(row.name),
          aliases: String(row.aliases),
          description: String(row.description),
          attitudes: states.filter(state => state.entity_id === row.id).map(state => ({ key: String(state.key), value: Number(state.value) })),
        })),
        objects: objects.map(row => ({
          id: String(row.id),
          name: String(row.name),
          category: String(row.category),
          description: String(row.description),
          attitudes: states.filter(state => state.entity_id === row.id).map(state => ({ key: String(state.key), value: Number(state.value) })),
        })),
      })
    } catch {
      return asJson({ sleep: [], selfTags: [], personTags: [], selfState: [], lingering: [], persons: [], objects: [] })
    } finally {
      db.close()
    }
  }

  /** 只创建/合并预设，不创建会话（「前世」注入在会话启动时自动发生）。 */
  @Remote
  async createCharacterPreset(input: JsonValue): Promise<JsonValue> {
    const body = input as { plan?: unknown, basePresetId?: unknown }
    const plan = typeof body.plan === 'string' ? body.plan.trim().toLowerCase() : ''
    const card = this.store.byPlan(plan)
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id: plan })
    const presets = this.svc<{
      register(spec: unknown): Promise<unknown>
      list(): Promise<Array<{ id: string, name?: string, description?: string, broken?: string }>>
      compositionInventory?(): Promise<Array<{ id: string }>>
    }>('agentPresets')
    if (presets === undefined) throw new RemoteError('memory-echo/invalid-input', '预设服务尚未就绪', {})

    const base = typeof body.basePresetId === 'string' ? body.basePresetId.trim() : ''
    if (base === '') throw new RemoteError('memory-echo/invalid-input', '请先选择基础预设', {})
    let plugins: Array<Record<string, unknown>> = []
    try {
      const roster = await presets.list()
      if (!roster.some(one => String(one.id) === base && (one.broken === undefined || one.broken === ''))) {
        throw new RemoteError('memory-echo/invalid-input', `基础预设当前不可用：${base}`, { id: base })
      }
      // 优先读取预设原始 YAML：保留每一行的 config，避免克隆后缺必填项。
      const readDocument = (presets as unknown as {
        readDocument?(id: string): Promise<{ content?: string }>
      }).readDocument
      if (typeof readDocument === 'function') {
        try {
          const document = await readDocument.call(presets, base)
          const parsed = parseYaml(String(document.content ?? ''), {
            customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }],
          })
          const rows = Array.isArray(parsed)
            ? parsed
            : (parsed !== null && typeof parsed === 'object' && Array.isArray((parsed as { plugins?: unknown[] }).plugins)
              ? (parsed as { plugins: unknown[] }).plugins
              : [])
          plugins = rows
            .filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object' && typeof (row as { name?: unknown }).name === 'string')
            .map(row => ({ ...row }))
        } catch { /* 解析失败时退回 inventory */ }
      }
      if (plugins.length === 0) {
        const inventory = await presets.compositionInventory?.() ?? []
        const baseEntry = inventory.find(one => String(one.id) === base) as
          { broken?: string, rows?: Array<{ entryId?: string | null, moduleName?: string, enabled?: unknown }> } | undefined
        if (baseEntry === undefined) {
          throw new RemoteError('memory-echo/invalid-input', `基础预设不存在或不可用：${base}`, { id: base })
        }
        if (typeof baseEntry.broken === 'string' && baseEntry.broken !== '') {
          throw new RemoteError('memory-echo/invalid-input', `基础预设不可用：${baseEntry.broken}`, { id: base })
        }
        plugins = (baseEntry.rows ?? [])
          .filter(row => row.enabled !== false && typeof row.moduleName === 'string' && row.moduleName !== '')
          .map((row, index) => ({
            id: typeof row.entryId === 'string' && row.entryId !== '' ? row.entryId : `row-${index}`,
            name: row.moduleName as string,
          }))
      }
    } catch (cause) {
      if (cause instanceof RemoteError) throw cause
      throw new RemoteError('memory-echo/invalid-input', '无法读取基础预设组成，请刷新后重试', {})
    }
    if (plugins.length === 0) {
      throw new RemoteError('memory-echo/invalid-input', `基础预设没有可用的插件组成：${base}`, { id: base })
    }
    const normalized = plugins.map(row => {
      const name = String(row.name ?? '')
      const config = (row.config ?? {}) as Record<string, unknown>
      if (name.includes('dsh-tool-fs-search')) return { ...row, config: { ...config, sampleOverCapGlobResults: config.sampleOverCapGlobResults ?? false } }
      if (name.includes('dsh-tool-todo')) return { ...row, config: { ...config, allowParallelInProgress: config.allowParallelInProgress ?? true } }
      return row
    })
    const merged = normalized
      .filter(row => !String(row.name ?? row.id ?? '').includes('persona') && row.id !== 'memory-echo-tools')
      .concat([
        // 姓名/角色介绍由 memory-echo 在 systemPrompt 里动态注入，避免与预设快照重复。
        { id: 'memory-echo-tools', name: '@dsh/memory-echo-tools', inject: ['tools'], config: { memory: card.plan } },
      ])

    const existing = new Set<string>()
    try { for (const one of await presets.compositionInventory?.() ?? []) existing.add(one.id) } catch { /* 空 */ }
    if (existing.has(card.plan)) throw new RemoteError('memory-echo/name-duplicate', `有同名预设，无法创建：${card.plan}`, { name: card.plan })
    try {
      await presets.register({ id: card.plan, name: card.plan, description: card.persona.slice(0, 80), order: -30, plugins: merged })
    } catch {
      throw new RemoteError('memory-echo/name-duplicate', `有同名预设，无法创建：${card.plan}`, { name: card.plan })
    }
    writeActive([...readActive(), card.plan])
    return asJson({ plan: card.plan, name: card.name })
  }

  /**
   * 为所有角色卡生成独立预设文件（插件本地 data/presets/characters.yml）。
   * 只写 preset 行，不含安装级组件；由 profile 里一条 include 引用加载。
   */
  @Remote
  async generatePresets(): Promise<JsonValue> {
    const cards = this.store.list().filter(card =>
      card.plan !== '' && card.name !== '' && card.persona !== '' && card.address !== '' && card.embeddingModel !== '')
    const q = (value: string): string => JSON.stringify(value)
    const rows = cards.map(card => [
      '- insert:',
      `    - id: preset-char-${card.plan}`,
      "      name: '@deepseek-ai/dsh-agent-preset'",
      '      config:',
      `        id: ${card.plan}`,
      `        name: ${q(card.plan)}`,
      `        description: ${q(card.persona.slice(0, 80))}`,
      '        order: -30',
      '        plugins:',
      '          - id: persona',
      "            name: '@deepseek-ai/dsh-persona'",
      '            config:',
      `              prefix: ${q(`你叫${card.name}，${card.persona}`)}`,
      '          - id: agent-instructions',
      "            name: '@deepseek-ai/dsh-agent-instructions'",
      '            config:',
      '              maxBytes: 65536',
      '          - id: tool-bash',
      "            name: '@deepseek-ai/dsh-tool-bash'",
      "            disabled: !!js process.platform === 'win32'",
      '          - id: tool-pwsh',
      "            name: '@deepseek-ai/dsh-tool-pwsh'",
      "            disabled: !!js process.platform !== 'win32'",
      '          - id: tool-fs',
      "            name: '@deepseek-ai/dsh-tool-fs'",
      '          - id: tool-fs-search',
      "            name: '@deepseek-ai/dsh-tool-fs-search'",
      '            config:',
      '              sampleOverCapGlobResults: false',
      '          - id: tool-jobs',
      "            name: '@deepseek-ai/dsh-tool-jobs'",
      '          - id: skill-filesystem',
      "            name: '@deepseek-ai/dsh-skill-filesystem'",
      '          - id: tool-skill',
      "            name: '@deepseek-ai/dsh-tool-skill'",
      '          - id: tool-todo',
      "            name: '@deepseek-ai/dsh-tool-todo'",
      '            config:',
      '              allowParallelInProgress: true',
      '          - id: tool-ask-user',
      "            name: '@deepseek-ai/dsh-tool-ask-user'",
      '          - id: present',
      "            name: '@deepseek-ai/dsh-tool-present'",
      '          - id: memory-echo-tools',
      "            name: '@dsh/memory-echo-tools'",
      '            inject: [tools]',
      '            config:',
      `              memory: ${card.plan}`,
    ].join('\n'))
    // include 读取的是 loader 树，不是 patch：去掉 insert 包装并反缩进。
    const plainRows = rows.map(block => block.split('\n')
      .filter(line => !line.trimStart().startsWith('- insert:'))
      .map(line => line.startsWith('    ') ? line.slice(4) : line)
      .join('\n'))
    const dir = join(dataRoot(), 'presets')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, 'characters.yml')
    writeFileSync(path, `${plainRows.join('\n')}\n`)
    let conflicts: string[] = []
    try {
      conflicts = await registerCharacterPresets(this.ctx as unknown as Context)
    } catch {
      // 预设注册失败不影响生成文件本身。
    }
    return asJson({ path, generated: cards.length, skipped: this.store.list().length - cards.length, conflicts })
  }

  /** Every saved connection card, plus editor defaults (local dir inside the plugin). */
  @Remote
  async connList(): Promise<JsonValue> {
    return asJson({ connections: this.store.list(), defaults: { localDir: localDatabaseDir() } })
  }

  /** Create one connection card (the name must be unique — tools use it as the handle). */
  @Remote
  async connCreate(input: JsonValue): Promise<JsonValue> {
    const body = input as Record<string, unknown>
    const problem = validate(body, this.store.list())
    if (problem !== undefined) throw fault(problem)
    return asJson(this.store.create(body))
  }

  /** Update one connection card in place (unique-name check skips itself). */
  @Remote
  async connUpdate(input: JsonValue): Promise<JsonValue> {
    const { id, ...fields } = input as Record<string, unknown> & { id: string }
    const current = this.store.get(id)
    if (current === undefined) {
      throw new RemoteError('memory-echo/not-found', '卡片不存在', { id })
    }
    const problem = validate({ ...current, ...fields }, this.store.list(), id)
    if (problem !== undefined) throw fault(problem)
    const updated = this.store.update(id, fields)
    if (updated === undefined) {
      throw new RemoteError('memory-echo/not-found', '卡片不存在', { id })
    }
    return asJson(updated)
  }

  /** Delete one connection card. */
  @Remote
  async connDelete(input: JsonValue): Promise<JsonValue> {
    const { id } = input as { id: string }
    if (!this.store.remove(id)) {
      throw new RemoteError('memory-echo/not-found', '卡片不存在', { id })
    }
    return asJson({ message: '卡片已删除' })
  }

  /**
   * The embedding model catalog for the card editor's engine picker; empty
   * (not an error) when the embedding service is absent, so the editor
   * stays usable and the UI shows a hint instead.
   */
  @Remote
  async embeddingModels(): Promise<JsonValue> {
    const embedding = this.svc<{ listModels(): Array<{ id: string; file: string; loaded: boolean }> }>('embedding')
    if (embedding === undefined) return asJson({ models: [], available: false })
    return asJson({ models: embedding.listModels(), available: true })
  }

  /**
   * KNN search over one card's database: embed the query with the card's
   * bound engine, then run a top-k nearest-neighbour query. Local cards
   * search the sqlite-vec file at `address`; service cards are not
   * implemented yet (the tools own that transport later).
   */
  @Remote
  async connQuery(input: JsonValue): Promise<JsonValue> {
    const body = input as { id?: unknown; query?: unknown; topK?: unknown }
    const id = typeof body.id === 'string' ? body.id : ''
    const text = typeof body.query === 'string' ? body.query.trim() : ''
    if (text === '') throw new RemoteError('memory-echo/invalid-input', '检索内容不能为空', {})
    const card = this.store.get(id)
    if (card === undefined) throw new RemoteError('memory-echo/not-found', '卡片不存在', { id })

    const embedding = this.svc<{ embed(inputs: readonly string[], modelId?: string): Promise<number[][]> }>('embedding')
    if (embedding === undefined) {
      throw new RemoteError('memory-echo/embedding-unavailable', 'embedding 服务不可用：请先在账号列启用本地向量模型', {})
    }
    const vectors = await embedding.embed([text], card.embeddingModel === '' ? undefined : card.embeddingModel)
    const vector = vectors[0]
    if (vector === undefined || vector.length === 0) {
      throw new RemoteError('memory-echo/embedding-failed', '查询向量生成失败', {})
    }

    const k = Math.min(Math.max(Number(body.topK) || 5, 1), 20)
    // queryLocal heals the database on demand, so a card whose file was
    // deleted (or never written) yields an empty result rather than an error.
    const results = queryLocal(card.address, vector, k)
    return asJson({ results })
  }
}

/**
 * 把角色卡注册成 agent 预设（直接走 agentPresets 服务，不依赖外部 include）。
 * 预设是"可选定义"，不选中就不会实例化任何插件。
 */
interface SeedLine { role: string, text: string }


/** 用户通过「创建预设与对话」显式创建过的预设（跨重启恢复）。 */
function activePath(): string {
  return join(dataRoot(), 'presets', 'active.json')
}

function readActive(): string[] {
  try {
    const raw = JSON.parse(readFileSync(activePath(), 'utf8')) as unknown
    return Array.isArray(raw) ? raw.filter((one): one is string => typeof one === 'string') : []
  } catch {
    return []
  }
}

function writeActive(list: readonly string[]): void {
  mkdirSync(join(dataRoot(), 'presets'), { recursive: true })
  writeFileSync(activePath(), JSON.stringify([...new Set(list)], null, 2))
}

/** 预设注册服务的可选面；compositionInventory 用来枚举已有预设。 */
interface PresetRegistry {
  register(spec: unknown): Promise<() => Promise<void>>
  compositionInventory?(): Promise<Array<{ id: string }>>
}

/**
 * 把角色卡注册成 agent 预设。同名预设一律不覆盖：已存在即记入 conflicts，
 * 由界面弹窗提示「有同名预设，无法创建」。
 */
export async function registerCharacterPresets(ctx: Context, only?: readonly string[]): Promise<string[]> {
  const conflicts: string[] = []
  const presets = (ctx as unknown as { get<T>(name: string): T | undefined }).get<PresetRegistry>('agentPresets')
  if (presets === undefined) return conflicts

  const existing = new Set<string>()
  try {
    const inventory = await presets.compositionInventory?.() ?? []
    for (const composition of inventory) existing.add(composition.id)
  } catch {
    // 枚举失败时按“未知”处理：仍尝试注册，重复注册错误会落到 conflicts。
  }

  const store = new ConnectionStore()
  const allow = only === undefined ? undefined : new Set(only)
  for (const card of store.list()) {
    if (allow !== undefined && !allow.has(card.plan)) continue
    if (card.plan === '' || card.name === '' || card.persona === '' || card.address === '' || card.embeddingModel === '') continue
    if (existing.has(card.plan)) {
      conflicts.push(card.plan)
      continue
    }
    try {
      await presets.register({
        id: card.plan,
        name: card.plan,
        description: card.persona.slice(0, 80),
        order: -30,
        plugins: [
          { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: `你叫${card.name}，${card.persona}` } },
          { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
          { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
          { id: 'tool-fs-search', name: '@deepseek-ai/dsh-tool-fs-search', config: { sampleOverCapGlobResults: false } },
          { id: 'tool-jobs', name: '@deepseek-ai/dsh-tool-jobs' },
          { id: 'tool-todo', name: '@deepseek-ai/dsh-tool-todo', config: { allowParallelInProgress: true } },
          { id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' },
          { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
          { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
          { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
          { id: 'memory-echo-tools', name: '@dsh/memory-echo-tools', inject: ['tools'], config: { memory: card.plan } },
        ],
      })
    } catch {
      conflicts.push(card.plan)
    }
  }
  return conflicts
}

export async function apply(ctx: Context): Promise<void> {
  migrateLegacyCards()
  try {
    const store = new ConnectionStore()
    for (const card of store.list()) {
      cleanupReasoningMemories(card.address)
      backfillMemories(card.address)
    }
  } catch { /* 回填失败不影响启动 */ }
  ctx.plugin(MemoryRecallController)
  // 只恢复用户显式创建过的预设（active.json）；普通卡片不自动注册。
  let attempts = 0
  const restore = (): void => {
    const presets = (ctx as unknown as { get<T>(name: string): T | undefined }).get('agentPresets')
    if (presets !== undefined) {
      const active = readActive()
      if (active.length > 0) {
        void registerCharacterPresets(ctx, active).catch(() => {})
      }
      return
    }
    if (++attempts < 40) setTimeout(restore, 250)
  }
  restore()
}
