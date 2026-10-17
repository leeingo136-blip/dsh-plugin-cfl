/**
 * Knowledge Book host seam: one `knowledge` remote namespace over two
 * capabilities — skill file management across the official discovery roots,
 * and a local sqlite-vec knowledge store embedded by the `embedding` service.
 *
 * Every method takes and returns plain JSON values, so the hand-written
 * Typert manifest (lib/typert.host.js) carries one reusable codec. The
 * embedding dependency is lazy (`ctx.get`) on purpose: the plugin must still
 * activate — and skill management must keep working — when the local
 * embedding plugin is disabled.
 */
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import zschema from '@deepseek-ai/schemastery'
import {
  deleteSkill, listSkills, readSkillBody, saveSkill, skillSources,
  type SkillEntry, type SkillSource, type WorkspaceLike,
} from './skills.ts'
import { RagStore } from './rag.ts'

export const name = 'knowledge-api'

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
interface KnowledgeContext {
  get<T = unknown>(name: string): T | undefined
}

/** The settings registry shape we read workspace-independent config through. */
interface SkillsRegistry {
  list(options?: unknown): Promise<Array<{ name: string; description: string; source?: string }>>
  get(name: string): Promise<{ content?: string } | undefined>
}

/**
 * Host service backing the generated `ctx.remote.knowledge` namespace.
 * @typert service knowledgeController
 */
export class KnowledgeController extends TypertRemoteService {
  private rag: RagStore | undefined

  constructor(ctx: Context) {
    super(ctx, 'knowledgeController', { namespace: 'knowledge' })
  }

  /** One lazy optional-service lookup, untyped at the boundary. */
  private svc<T>(name: string): T | undefined {
    return (this.ctx as unknown as KnowledgeContext).get<T>(name)
  }

  private embedFor(): (texts: readonly string[]) => Promise<number[][]> {
    const embedding = this.svc<{ embed(inputs: readonly string[], modelId?: string): Promise<number[][]> }>('embedding')
    if (embedding === undefined) {
      throw new RemoteError('knowledge/embedding-unavailable', '嵌入服务不可用：请先在账号列启用本地向量模型', {})
    }
    return inputs => embedding.embed(inputs)
  }

  private store(): RagStore {
    this.rag ??= new RagStore({ embed: inputs => this.embedFor()(inputs) })
    return this.rag
  }

  private workspaces(): WorkspaceLike {
    const registry = this.svc<WorkspaceLike>('workspaceRegistry')
    if (registry === undefined) throw new RemoteError('knowledge/workspace-unavailable', '工作区服务不可用', {})
    return registry
  }

  private sources(): SkillSource[] {
    return skillSources(this.workspaces())
  }

  private entryFor(name: string, sourceId: string): SkillEntry {
    const entry = listSkills(this.sources(), []).find(one => one.name === name && one.sourceId === sourceId)
    if (entry === undefined) throw new RemoteError('knowledge/skill-unknown', `技能不存在（${name}）`, {})
    return entry
  }

  /** Every manageable source, for the source dropdowns. */
  @Remote
  async skillSources(): Promise<JsonValue> {
    return asJson({ sources: this.sources() })
  }

  /** Every skill across all sources (file-backed + runtime). */
  @Remote
  async skillList(): Promise<JsonValue> {
    const runtimeSkills: Array<{ name: string; description: string }> = []
    const skills = this.svc<SkillsRegistry>('skills')
    if (skills !== undefined) {
      try {
        const all = await skills.list({})
        for (const one of all) {
          if (one.source === 'runtime') runtimeSkills.push({ name: one.name, description: one.description })
        }
      } catch {
        // Registry unavailable (no skill stack mounted): file listing still works.
      }
    }
    return asJson({ skills: listSkills(this.sources(), runtimeSkills) })
  }

  /** Body of one skill (file-backed read from disk; runtime via the registry). */
  @Remote
  async skillRead(input: JsonValue): Promise<JsonValue> {
    const { name, sourceId } = input as { name: string; sourceId: string }
    const entry = this.entryFor(name, sourceId)
    let body = readSkillBody(entry)
    if (body === '' && entry.form === 'runtime') {
      const skills = this.svc<SkillsRegistry>('skills')
      const loaded = await skills?.get(name)
      body = loaded?.content ?? ''
    }
    return asJson({ name: entry.name, description: entry.description, sourceId: entry.sourceId, body })
  }

  /**
   * Create or update one skill; moving between editable sources rides the
   * same call (fromSourceId + fromName identify the previous location).
   */
  @Remote
  async skillSave(input: JsonValue): Promise<JsonValue> {
    const request = input as unknown as Parameters<typeof saveSkill>[1]
    try {
      return asJson(saveSkill(this.sources(), request))
    } catch (error) {
      throw new RemoteError('knowledge/skill-save-failed',
        error instanceof Error ? error.message : String(error), {})
    }
  }

  /** Delete one file-backed skill from an editable source. */
  @Remote
  async skillDelete(input: JsonValue): Promise<JsonValue> {
    const { name, sourceId } = input as { name: string; sourceId: string }
    try {
      deleteSkill(this.sources(), sourceId, name)
      return asJson({ message: `已删除技能 ${name}` })
    } catch (error) {
      throw new RemoteError('knowledge/skill-delete-failed',
        error instanceof Error ? error.message : String(error), {})
    }
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
      throw new RemoteError('knowledge/rag-invalid', '知识库名称不能为空', {})
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
      throw new RemoteError('knowledge/rag-invalid', '没有可入库的文本', {})
    }
    const count = await this.store().ingest(id, texts)
    return asJson({ message: `已入库 ${count} 条`, count })
  }

  /** KNN query against one knowledge base. */
  @Remote
  async ragQuery(input: JsonValue): Promise<JsonValue> {
    const { id, text, k } = input as { id: string; text: string; k?: number }
    if (typeof text !== 'string' || text.trim() === '') {
      throw new RemoteError('knowledge/rag-invalid', '查询文本不能为空', {})
    }
    const results = await this.store().query(id, text.trim(), Math.min(Math.max(k ?? 5, 1), 50))
    return asJson({ results })
  }
}

export function apply(ctx: Context): void {
  ctx.plugin(KnowledgeController)
}
