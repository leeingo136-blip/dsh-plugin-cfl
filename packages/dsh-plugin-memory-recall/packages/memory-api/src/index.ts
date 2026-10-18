/**
 * Memory-recall host seam: the RAG connection card registry exposed as the
 * `memory-recall` remote namespace. The embedding dependency is lazy
 * (`ctx.get`) and read-only (`listModels`) on purpose: cards are pure
 * configuration — create/list/edit/delete keep working when the local
 * embedding plugin is disabled, and the model picker just shows an empty
 * catalog with a hint.
 *
 * Every method takes and returns plain JSON values, so the hand-written
 * Typert manifest (lib/typert.host.js) carries one reusable codec.
 */
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import zschema from '@deepseek-ai/schemastery'
import { ConnectionStore, localDatabaseDir, validate, type ConnectionFault } from './connections.ts'
import { queryLocal } from './query.ts'

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
    case 'name-required':
      return new RemoteError('memory-recall/invalid-input', '名称不能为空', {})
    case 'name-duplicate':
      return new RemoteError('memory-recall/name-duplicate', `名称已存在：${error.name}`, { name: error.name })
    case 'kind-unknown':
      return new RemoteError('memory-recall/invalid-input', '未知的数据库类型', {})
    case 'address-required':
      return new RemoteError('memory-recall/invalid-input', '数据库地址不能为空', {})
    case 'embedding-required':
      return new RemoteError('memory-recall/invalid-input', '请选择 embedding 引擎', {})
  }
}

/**
 * Host service backing the generated `ctx.remote['memory-recall']` namespace.
 * @typert service memoryRecallController
 */
export class MemoryRecallController extends TypertRemoteService {
  private store = new ConnectionStore()

  constructor(ctx: Context) {
    super(ctx, 'memoryRecallController', { namespace: 'memory-recall' })
  }

  /** One lazy optional-service lookup, untyped at the boundary. */
  private svc<T>(name: string): T | undefined {
    return (this.ctx as unknown as HostContext).get<T>(name)
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
      throw new RemoteError('memory-recall/not-found', '卡片不存在', { id })
    }
    const problem = validate({ ...current, ...fields }, this.store.list(), id)
    if (problem !== undefined) throw fault(problem)
    const updated = this.store.update(id, fields)
    if (updated === undefined) {
      throw new RemoteError('memory-recall/not-found', '卡片不存在', { id })
    }
    return asJson(updated)
  }

  /** Delete one connection card. */
  @Remote
  async connDelete(input: JsonValue): Promise<JsonValue> {
    const { id } = input as { id: string }
    if (!this.store.remove(id)) {
      throw new RemoteError('memory-recall/not-found', '卡片不存在', { id })
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
    if (text === '') throw new RemoteError('memory-recall/invalid-input', '检索内容不能为空', {})
    const card = this.store.get(id)
    if (card === undefined) throw new RemoteError('memory-recall/not-found', '卡片不存在', { id })

    if (card.kind === 'service') {
      throw new RemoteError('memory-recall/not-implemented', '网络服务检索尚未实现', { kind: 'service' })
    }

    const embedding = this.svc<{ embed(inputs: readonly string[], modelId?: string): Promise<number[][]> }>('embedding')
    if (embedding === undefined) {
      throw new RemoteError('memory-recall/embedding-unavailable', 'embedding 服务不可用：请先在账号列启用本地向量模型', {})
    }
    const vectors = await embedding.embed([text], card.embeddingModel === '' ? undefined : card.embeddingModel)
    const vector = vectors[0]
    if (vector === undefined || vector.length === 0) {
      throw new RemoteError('memory-recall/embedding-failed', '查询向量生成失败', {})
    }

    const k = Math.min(Math.max(Number(body.topK) || 5, 1), 20)
    const outcome = queryLocal(card.address, vector, k)
    if (!Array.isArray(outcome)) {
      switch (outcome.code) {
        case 'db-missing':
          throw new RemoteError('memory-recall/db-missing', `数据库文件不存在：${outcome.address}`, { address: outcome.address })
        case 'db-empty':
          throw new RemoteError('memory-recall/db-empty', '数据库为空：尚未写入任何知识（等待 knowledge_add 工具实现）', { address: outcome.address })
      }
    }
    return asJson({ results: outcome })
  }
}

export function apply(ctx: Context): void {
  ctx.plugin(MemoryRecallController)
}
