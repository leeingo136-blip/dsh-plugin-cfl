/**
 * Memory-recall toolset: the six card-facing tools.
 *
 * Activation model is two-gated, and both gates are official machinery:
 * 1. The preset row opts the toolset into a session (a preset without the
 *    row never sees any of the tools; the loop is untouched).
 * 2. Each tool additionally requires its OWN binding in the row config —
 *    the name of the「记忆回想」card it operates on. A tool whose binding is
 *    blank is never registered, so it stays out of every tool list.
 *
 * The knowledge trio are real RAG tools: they resolve the bound card by
 * name, embed through the card's bound engine, and read/write the sqlite-vec
 * database (created and initialized on first use — a card whose file was
 * deleted heals itself). memory_recall / memory_add / dream keep their
 * placeholder executes until their functionality lands, under the same
 * binding gate.
 *
 * Plain plugin, not a Service: it publishes nothing for other rows to
 * inject, and a Service would leak into the root realm, which the preset
 * mount refuses.
 *
 * @module memory-recall-tools
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import zschema from '@deepseek-ai/schemastery'
import {
  ConnectionStore,
  clearChunks,
  deleteByContent,
  insertChunks,
  queryLocal,
  type ChunkInput,
  type ConnectionRecord,
  type QueryHit,
  type WriteFault,
} from '@dsh/api-memory-recall'

export const inject = ['tools']

/** The schema class instance type, nameable without dragging cosmokit in. */
type SchemaNode = InstanceType<typeof zschema>

/**
 * Per-tool bindings, one config field per tool. knowledge_* fields hold a
 * card name; memory_recall/memory_add hold card name(s); dream is a plain
 * switch. Blank/absent = the tool is not registered for the session.
 */
export const Config = zschema.object({
  knowledge_add: zschema.string().default('')
    .description('knowledge_add 绑定的记忆库卡片名称（留空则本会话不注入该工具）'),
  knowledge_search: zschema.string().default('')
    .description('knowledge_search 绑定的记忆库卡片名称（留空则不注入）'),
  knowledge_delete: zschema.string().default('')
    .description('knowledge_delete 绑定的记忆库卡片名称（留空则不注入）'),
  memory_recall: zschema.string().default('')
    .description('memory_recall 绑定的卡片（功能待接入）'),
  memory_add: zschema.string().default('')
    .description('memory_add 绑定的默认卡片（功能待接入）'),
  dream: zschema.boolean().default(false)
    .description('是否注入 dream 工具（功能待接入）'),
}) as unknown as SchemaNode

export interface ToolsConfig {
  knowledge_add: string
  knowledge_search: string
  knowledge_delete: string
  memory_recall: string
  memory_add: string
  dream: boolean
}

/** Tool names, in presentation order. */
export const TOOL_NAMES = [
  'knowledge_add',
  'knowledge_search',
  'knowledge_delete',
  'memory_recall',
  'memory_add',
  'dream',
] as const

const PENDING = '尚未实现：该工具已注册为占位，参数已受理，功能将后续接入。'

/** The minimal embedding face this toolset consumes (the local plugin's service). */
interface EmbeddingService {
  embed(inputs: readonly string[], modelId?: string): Promise<number[][]>
}

/** One lazy optional-service lookup, untyped at the boundary. */
interface HostContext {
  get<T = unknown>(name: string): T | undefined
}

/** The card registry — the same JSON store the 设置 → 记忆回想 editor manages. */
const store = new ConnectionStore()

/** Tool errors surface to the model as failed calls with this exact text. */
function fail(message: string): never {
  throw new Error(message)
}

/** Resolve the bound card by its unique name; local files only for now. */
function resolveCard(name: string): ConnectionRecord {
  const card = store.list().find(one => one.name === name)
  if (card === undefined) {
    fail(`调用错误：记忆库「${name}」不存在——设置 → 记忆回想 中没有该名称的卡片。`)
  }
  if (card.kind === 'service') {
    fail(`调用错误：记忆库「${name}」是网络服务类型，工具读写暂未实现。`)
  }
  return card
}

/** Embed texts through the card's bound engine; the service is optional by design. */
async function embedTexts(ctx: Context, card: ConnectionRecord, inputs: readonly string[]): Promise<number[][]> {
  const embedding = (ctx as unknown as HostContext).get<EmbeddingService>('embedding')
  if (embedding === undefined) {
    fail('调用错误：embedding 服务不可用——请先在账号页启用本地向量模型。')
  }
  const vectors = await embedding.embed(inputs, card.embeddingModel === '' ? undefined : card.embeddingModel)
  if (!Array.isArray(vectors) || vectors.length !== inputs.length ||
      vectors.some(vector => !Array.isArray(vector) || vector.length === 0)) {
    fail('调用错误：查询向量生成失败（embedding 服务返回异常）。')
  }
  return vectors
}

/** Map a storage-layer refusal onto a tool error the model can act on. */
function writeFault(fault: WriteFault): never {
  if (fault.code === 'dim-mismatch') {
    fail(`调用错误：向量维度不匹配——库为 ${fault.expected} 维，模型产出 ${fault.actual} 维。该卡片更换过 embedding 引擎，需重建数据库（清空后重写）。`)
  }
  fail('调用错误：向量生成失败。')
}

const output = {
  schema: { type: 'json' } as const,
  render: (_args: unknown, value: unknown): { type: 'text'; text: string }[] =>
    [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

export function apply(ctx: Context, config: ToolsConfig): void {
  const disposers: Array<() => void> = []

  /** Register only bound tools — an unbound tool never enters any tool list. */
  const registerIfBound = (bound: string | boolean, register: () => () => void): void => {
    const active = typeof bound === 'boolean' ? bound : bound.trim() !== ''
    if (active) disposers.push(register())
  }

  // --- knowledge_add -----------------------------------------------------
  registerIfBound(config.knowledge_add, () => ctx.tools.register(defineTool({
    name: 'knowledge_add',
    description: `向绑定的 RAG 记忆库「${config.knowledge_add.trim()}」添加文本条目（自动向量化后入库，并记录添加日期）。`,
    parameters: {
      texts: { type: 'string', required: true, description: '要入库的文本，多行以 \\n 分隔，每行一条。' },
    },
    output,
    async execute(args: unknown) {
      const { texts } = args as { texts?: unknown }
      const card = resolveCard(config.knowledge_add.trim())
      const lines = (typeof texts === 'string' ? texts : '').split('\n')
        .map(line => line.trim())
        .filter(line => line !== '')
      if (lines.length === 0) fail('调用错误：没有可入库的非空文本。')
      const vectors = await embedTexts(ctx, card, lines)
      const addedAt = new Date().toISOString()
      const items: ChunkInput[] = lines.map((content, index) => ({ content, vector: vectors[index] ?? [] }))
      const outcome = insertChunks(card.address, items, addedAt)
      if ('code' in outcome) writeFault(outcome)
      return { ok: true, database: card.name, added: outcome.added }
    },
  })))

  // --- knowledge_search --------------------------------------------------
  registerIfBound(config.knowledge_search, () => ctx.tools.register(defineTool({
    name: 'knowledge_search',
    description: `在绑定的 RAG 记忆库「${config.knowledge_search.trim()}」中做向量近邻检索，按相关性返回最相关的条目（附添加日期）。`,
    parameters: {
      query: { type: 'string', required: true, description: '查询文本。' },
      k: { type: 'number', description: '返回条数（默认 5，上限 20）。' },
    },
    output,
    async execute(args: unknown) {
      const { query, k } = args as { query?: unknown; k?: unknown }
      const card = resolveCard(config.knowledge_search.trim())
      const text = typeof query === 'string' ? query.trim() : ''
      if (text === '') fail('调用错误：查询文本不能为空。')
      const [vector] = await embedTexts(ctx, card, [text])
      const topK = Math.min(Math.max(Number(k) || 5, 1), 20)
      const results: QueryHit[] = queryLocal(card.address, vector ?? [], topK)
      return { ok: true, database: card.name, results }
    },
  })))

  // --- knowledge_delete --------------------------------------------------
  registerIfBound(config.knowledge_delete, () => ctx.tools.register(defineTool({
    name: 'knowledge_delete',
    description: `从绑定的 RAG 记忆库「${config.knowledge_delete.trim()}」删除条目：按内容匹配删除，或 all 清空整库。`,
    parameters: {
      query: { type: 'string', description: '按内容匹配删除（子串匹配，删除全部命中）。' },
      all: { type: 'boolean', description: '清空该记忆库全部条目。' },
    },
    output,
    async execute(args: unknown) {
      const { query, all } = args as { query?: unknown; all?: unknown }
      const card = resolveCard(config.knowledge_delete.trim())
      const needle = typeof query === 'string' ? query.trim() : ''
      if (all !== true && needle === '') {
        fail('调用错误：请提供 query（按内容匹配删除）或 all=true（清空整库）。')
      }
      const outcome = all === true ? clearChunks(card.address) : deleteByContent(card.address, needle)
      return { ok: true, database: card.name, deleted: outcome.deleted, deletedTexts: outcome.contents }
    },
  })))

  // --- placeholders (same gate, functionality lands later) ----------------
  registerIfBound(config.memory_recall, () => ctx.tools.register(defineTool({
    name: 'memory_recall',
    description: '跨记忆库回想：按查询文本在多张卡片中检索相关记忆。',
    parameters: {
      query: { type: 'string', required: true, description: '回想查询文本。' },
      databases: { type: 'string', description: '限定检索的卡片名称列表，逗号分隔；缺省检索全部。' },
      k: { type: 'number', description: '每库返回条数（默认 5）。' },
    },
    output,
    async execute() {
      return { ok: false, note: PENDING }
    },
  })))

  registerIfBound(config.memory_add, () => ctx.tools.register(defineTool({
    name: 'memory_add',
    description: '写入一条记忆：进入绑定的默认记忆卡片。',
    parameters: {
      text: { type: 'string', required: true, description: '要记住的内容。' },
    },
    output,
    async execute() {
      return { ok: false, note: PENDING }
    },
  })))

  registerIfBound(config.dream, () => ctx.tools.register(defineTool({
    name: 'dream',
    description: '整理与巩固记忆：对记忆库做归纳、去重、摘要（梦境整理）。',
    parameters: {},
    output,
    async execute() {
      return { ok: false, note: PENDING }
    },
  })))

  ctx.effect(() => () => {
    for (const dispose of disposers) dispose()
  }, 'memory-recall-tools: card tools')
}
