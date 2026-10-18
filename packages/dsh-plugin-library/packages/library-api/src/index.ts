/**
 * Library host seam: a local sqlite-vec knowledge store exposed as the
 * `library` remote namespace, embedded by the optional `embedding` service.
 *
 * Every method takes and returns plain JSON values, so the hand-written
 * Typert manifest (lib/typert.host.js) carries one reusable codec. The
 * embedding dependency is lazy (`ctx.get`) on purpose: the plugin must still
 * activate — listing and deleting bases keep working — when the local
 * embedding plugin is disabled.
 */
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import zschema from '@deepseek-ai/schemastery'
import { RagStore } from './rag.ts'

export const name = 'library-api'

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

/**
 * Host service backing the generated `ctx.remote.library` namespace.
 * @typert service libraryController
 */
export class LibraryController extends TypertRemoteService {
  private rag: RagStore | undefined

  constructor(ctx: Context) {
    super(ctx, 'libraryController', { namespace: 'library' })
  }

  /** One lazy optional-service lookup, untyped at the boundary. */
  private svc<T>(name: string): T | undefined {
    return (this.ctx as unknown as HostContext).get<T>(name)
  }

  private embedFor(): (texts: readonly string[]) => Promise<number[][]> {
    const embedding = this.svc<{ embed(inputs: readonly string[], modelId?: string): Promise<number[][]> }>('embedding')
    if (embedding === undefined) {
      throw new RemoteError('library/embedding-unavailable', '嵌入服务不可用：请先在账号列启用本地向量模型', {})
    }
    return inputs => embedding.embed(inputs)
  }

  private store(): RagStore {
    this.rag ??= new RagStore({ embed: inputs => this.embedFor()(inputs) })
    return this.rag
  }

  /** Every knowledge base with chunk counts. */
  @Remote
  async ragList(): Promise<JsonValue> {
    return asJson({ databases: this.store().list() })
  }

  /** Create one knowledge base (dimension learned from the bound model). */
  @Remote
  async ragCreate(input: JsonValue): Promise<JsonValue> {
    const { name, description, model } = input as { name: string; description?: string; model?: string }
    if (typeof name !== 'string' || name.trim() === '') {
      throw new RemoteError('library/rag-invalid', '知识库名称不能为空', {})
    }
    return asJson(await this.store().create(name.trim(), description ?? '', model))
  }

  /** Delete one knowledge base and its file. */
  @Remote
  async ragDelete(input: JsonValue): Promise<JsonValue> {
    const { id } = input as { id: string }
    this.store().delete(id)
    return asJson({ message: '知识库已删除' })
  }

  /** Embed and store a batch of chunks. */
  @Remote
  async ragIngest(input: JsonValue): Promise<JsonValue> {
    const { id, texts } = input as { id: string; texts: string[] }
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new RemoteError('library/rag-invalid', '没有可入库的文本', {})
    }
    const count = await this.store().ingest(id, texts)
    return asJson({ message: `已入库 ${count} 条`, count })
  }

  /** KNN query against one knowledge base. */
  @Remote
  async ragQuery(input: JsonValue): Promise<JsonValue> {
    const { id, text, k } = input as { id: string; text: string; k?: number }
    if (typeof text !== 'string' || text.trim() === '') {
      throw new RemoteError('library/rag-invalid', '查询文本不能为空', {})
    }
    const results = await this.store().query(id, text.trim(), Math.min(Math.max(k ?? 5, 1), 50))
    return asJson({ results })
  }
}

export function apply(ctx: Context): void {
  ctx.plugin(LibraryController)
}
