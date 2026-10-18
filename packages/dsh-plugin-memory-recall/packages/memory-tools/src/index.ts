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
 * deleted heals itself). memory_add / memory_recall are the experimental
 * memory interface: memory_add slices conversations / read files / thought
 * chains into the store (with kind & source metadata), memory_recall scores
 * slices by weighted topic-word frequency (70%) plus recency (30%), picks at
 * most three seeds and grows each along time-adjacent slices until the
 * frequency clearly drops, merging each coherent run into one memory.
 * dream keeps its placeholder execute until its functionality lands, under
 * the same binding gate.
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
  expandAdjacent,
  insertChunks,
  listChunks,
  queryLocal,
  scoreRows,
  weightedFrequency,
  type ChunkInput,
  type ChunkMeta,
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
    .description('memory_recall 绑定的记忆库卡片名称（留空则不注入）'),
  memory_add: zschema.string().default('')
    .description('memory_add 绑定的记忆库卡片名称（留空则不注入）'),
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

/** The slice kinds memory_add accepts（实验性记忆接口的来源分类）。 */
const MEMORY_KINDS = ['conversation', 'file', 'thought'] as const

/**
 * 切片：按空行分段；超长段在 ~1000 字符边界硬切（尽量落在换行处）。
 * 同一次调用产生的切片共享同一时间戳、rowid 连续——这正是
 * memory_recall 相邻扩选所依赖的“时间上下的相邻切片”。
 */
function sliceMemory(text: string, limit = 1200): string[] {
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

const round1 = (value: number): number => Math.round(value * 10) / 10

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

  // --- memory_add（实验性记忆接口：对话/文件/思考链切片入库） ------------
  registerIfBound(config.memory_add, () => ctx.tools.register(defineTool({
    name: 'memory_add',
    description: `把你（LLM）的对话片段、读取的文件内容、思考链写入绑定的记忆库「${config.memory_add.trim()}」：自动切片、向量化并记录时间，供 memory_recall 回想。`,
    parameters: {
      text: { type: 'string', required: true, description: '要记住的内容（对话/文件/思考链原文），长文本自动按段落切片。' },
      type: { type: 'string', description: '切片来源类型：conversation（对话，默认）/ file（文件）/ thought（思考链）。' },
      source: { type: 'string', description: '来源标注，如文件路径或会话主题。' },
    },
    output,
    async execute(args: unknown) {
      const { text, type, source } = args as { text?: unknown; type?: unknown; source?: unknown }
      const card = resolveCard(config.memory_add.trim())
      const body = typeof text === 'string' ? text.trim() : ''
      if (body === '') fail('调用错误：没有可记住的内容。')
      const kind = typeof type === 'string' && type.trim() !== '' ? type.trim() : 'conversation'
      if (!(MEMORY_KINDS as readonly string[]).includes(kind)) {
        fail('调用错误：type 仅支持 conversation / file / thought。')
      }
      const src = typeof source === 'string' ? source.trim() : ''
      const slices = sliceMemory(body)
      if (slices.length === 0) fail('调用错误：内容切片后为空。')
      const vectors = await embedTexts(ctx, card, slices)
      const meta: ChunkMeta = { kind, source: src }
      const outcome = insertChunks(
        card.address,
        slices.map((content, index): ChunkInput => ({ content, vector: vectors[index] ?? [] })),
        new Date().toISOString(),
        meta,
      )
      if ('code' in outcome) writeFault(outcome)
      return { ok: true, database: card.name, added: outcome.added, type: kind, source: src }
    },
  })))

  // --- memory_recall（实验性记忆接口：主题词打分 + 相邻切片扩选） ----------
  registerIfBound(config.memory_recall, () => ctx.tools.register(defineTool({
    name: 'memory_recall',
    description: `记忆回想：把要查的主题凝练成主题词（1~10 个，越靠前越重要），在绑定的记忆库「${config.memory_recall.trim()}」中按「主题词频率×权重（70%）+时间新鲜度（30%）」打分，选出最相关的记忆（最多 3 组，并沿时间相邻切片作连贯性扩展合并）。`,
    parameters: {
      topics: { type: 'string', required: true, description: '主题词列表，逗号分隔（1~10 个，按重要性排序，第一个权重最高）。例：进度管理,关键路径,EPC' },
    },
    output,
    async execute(args: unknown) {
      const { topics } = args as { topics?: unknown }
      const card = resolveCard(config.memory_recall.trim())
      const list = (typeof topics === 'string' ? topics : '')
        .split(/[,，、\n]/)
        .map(topic => topic.trim())
        .filter(topic => topic !== '')
        .slice(0, 10)
      if (list.length === 0) fail('调用错误：请提供 1~10 个主题词。')

      // 候选池 = 每个主题词的向量近邻（各取 15）∪ 含任一主题词的切片。
      const vectors = await embedTexts(ctx, card, list)
      const pool = new Set<number>()
      const hits: QueryHit[] = []
      for (const index of list.keys()) {
        hits.push(...queryLocal(card.address, vectors[index] ?? [], 15))
      }
      for (const hit of hits) pool.add(hit.id)

      const rows = listChunks(card.address)
      if (rows.length === 0) return { ok: true, database: card.name, topics: list, memories: [] }
      const freqByRow = new Map(rows.map(row => [row.id, weightedFrequency(row.content, list)]))
      const candidates = rows.filter(row => pool.has(row.id) || (freqByRow.get(row.id) ?? 0) > 0)
      if (candidates.length === 0) return { ok: true, database: card.name, topics: list, memories: [] }

      const ranked = scoreRows(candidates, list).slice(0, 3)
      const chronoIndex = new Map(rows.map((row, index) => [row.id, index]))
      const memories = ranked.map(seed => {
        const seedIndex = chronoIndex.get(seed.row.id) ?? 0
        const picked = expandAdjacent(rows, seedIndex, list)
        let text = picked.map(index => rows[index]?.content ?? '').filter(part => part !== '').join('\n')
        if (text.length > 4000) text = `${text.slice(0, 4000)}…（已截断）`
        return {
          score: seed.score,
          relevance: round1(seed.relevance),
          timeScore: round1(seed.timeScore),
          slices: picked.length,
          kind: seed.row.kind,
          source: seed.row.source,
          addedAt: seed.row.addedAt,
          text,
        }
      })
      return { ok: true, database: card.name, topics: list, memories }
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
