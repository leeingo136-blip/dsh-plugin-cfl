/**
 * RAG 知识库能力：一个方案参数 + 六个 CRUD 工具 + 一个随激活出现的技能。
 *
 * 工具面：add / search / get / list / update / delete。
 * 文档模型：一条知识 = 一个 document（稳定 id + title + revision），正文与向量
 * 存在同一事务里；更新用 revision 做乐观锁，删除默认软删。
 * 对话记忆归档与梦境已迁到人格插件，本组件不订阅任何会话事件。
 *
 * @module rag-knowledge-tools
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import zschema from '@deepseek-ai/schemastery'
import {
  countDocuments,
  createDocument,
  deleteDocuments,
  getDocument,
  listDocuments,
  searchByVector,
  updateDocument,
  type DocumentRecord,
  type WriteFault,
} from '@dsh/api-rag-knowledge'
import { embedTexts, resolveCard, store } from './cards.ts'

export const inject = ['tools']

/** The schema class instance type, nameable without dragging cosmokit in. */
type SchemaNode = InstanceType<typeof zschema>

/** One plan parameter shared by every tool; blank = whole group off. */
export const Config = zschema.object({
  knowledge: zschema.string().default('')
    .description('Knowledge 方案名称（记忆库卡片名）：启用后注入 add/search/get/list/update/delete 六个工具，并注册使用技能；留空则整组关闭'),
}) as unknown as SchemaNode

export interface ToolsConfig {
  knowledge: string
}

export const TOOL_NAMES = [
  'knowledge_add',
  'knowledge_search',
  'knowledge_get',
  'knowledge_list',
  'knowledge_update',
  'knowledge_delete',
] as const

interface SkillRegistry {
  register(skill: {
    name: string
    description: string
    whenToUse?: string
    content: string
    /** Required by the registry's load-time validation: a plain source string. */
    source: string
    invocation?: { modelInvocable: boolean, userInvocable: boolean }
  }): () => void
}

function fail(message: string): never {
  throw new Error(message)
}

function writeFault(fault: WriteFault): never {
  if (fault.code === 'dim-mismatch') {
    fail(`调用错误：向量维度不匹配——库为 ${fault.expected} 维，模型产出 ${fault.actual} 维。该卡片更换过 embedding 引擎，需重建数据库。`)
  }
  fail('调用错误：向量生成失败。')
}

/** Plain JSON projection of a document row. */
function docJson(doc: DocumentRecord): {
  id: string
  title: string
  summary: string
  tags: string
  status: string
  revision: number
  updatedAt: string
  createdAt: string
} {
  return {
    id: doc.id,
    title: doc.title,
    summary: doc.summary,
    tags: doc.tags,
    status: doc.status,
    revision: doc.revision,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
  }
}

function skillContent(plan: string): string {
  return [
    `# RAG 知识库（方案：${plan}）`,
    '',
    '本技能只在「RAG 知识库」组件被激活时出现；六个工具共用同一个方案，不需要也不能切换。',
    '',
    '## 一眼决策：什么时候调哪个',
    '',
    '| 用户想做什么 | 调用顺序 |',
    '|---|---|',
    '| 保存 / 记住 / 归档一段内容 | `knowledge_add`（先 `knowledge_search` 查重） |',
    '| 问“以前记过什么 / 有没有相关资料” | `knowledge_search` |',
    '| 看某条的完整正文 | `knowledge_get` |',
    '| 问“知识库里都有什么” | `knowledge_list` |',
    '| 更正 / 补充 / 改写某条 | `knowledge_get` → `knowledge_update`（带 revision） |',
    '| 删除某条 | `knowledge_search` 或 `knowledge_list` 定位 id → `knowledge_delete` |',
    '',
    '## 工具与时机',
    '',
    '### knowledge_add —— 新增',
    '- 用户要求“记住 / 存进知识库 / 归档”时；',
    '- 出现需要长期复用的事实、决定、接口约定、排查结论；',
    '- 写入前先 `knowledge_search` 查重。参数：title（必填）、content（必填）、summary、tags（JSON 数组字符串）、source。',
    '',
    '### knowledge_search —— 检索',
    '- 回答前需要确认“以前存过什么”时；',
    '- 返回包含 docId、title、snippet、distance、updatedAt；',
    '- 检索是向量近邻：先想清楚要查什么，必要时换措辞再查一次。',
    '',
    '### knowledge_get —— 读全文',
    '- 已知 id，需要正文与 revision 时；',
    '- 准备更新或删除之前，先 get 确认内容与当前 revision。',
    '',
    '### knowledge_list —— 列清单',
    '- 用户问“知识库里都有什么”、需要分页浏览时；',
    '- 参数：limit（默认 20）、offset、status（默认 active）、tag（按标签过滤）。',
    '',
    '### knowledge_update —— 更新',
    '- 用户要求修正/补充某条知识时；',
    '- 必须先 `knowledge_get` 拿到当前 revision，再带 revision 提交（乐观锁）；',
    '- 返回 stale 表示别人先改了：重新 get 后合并再提交；',
    '- 改 content 会重新计算向量，title/summary/tags 可单独改。',
    '',
    '### knowledge_delete —— 删除',
    '- 用户明确要求删除时；',
    '- 默认软删（status=deleted，仍可审计）；mode=hard 才真正移除并删向量；',
    '- 按 id 删除，不再做子串匹配。',
    '',
    '## 纪律',
    `1. 所有工具作用于方案「${plan}」，单一方案。`,
    '2. 写前查重、改前读 revision、删前确认 id。',
    '3. 检索不足时如实说明，不要用推测补全。',
    '4. 不把“当前对话的临时信息”写进知识库——那属于人格记忆。',
  ].join('\n')
}

const output = {
  schema: { type: 'json' } as const,
  render: (_args: unknown, value: unknown): { type: 'text'; text: string }[] =>
    [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

export function apply(ctx: Context, config: ToolsConfig): void {
  const plan = config.knowledge.trim()
  if (plan === '') return
  const disposers: Array<() => void> = []

  // Activation-time check. A typo'd plan is a configuration error, not a runtime
  // one: fail the row so the preset refuses to assemble and the user sees it
  // immediately, instead of registering six tools that every call rejects.
  // (A plan created later needs a fresh session anyway — the mount is per agent.)
  if (!store.list().some(card => card.name === plan)) {
    throw new Error(`RAG 知识库：方案「${plan}」不存在——请先在 设置 → RAG 知识库 创建同名方案，再启用本预设。`)
  }

  // --- knowledge_add -----------------------------------------------------
  disposers.push(ctx.tools.register(defineTool({
    name: 'knowledge_add',
    description: `向 RAG 知识库「${plan}」新增一条知识（自动向量化，返回稳定 id 与 revision）。写入前应先用 knowledge_search 查重。`,
    parameters: {
      title: { type: 'string', required: true, description: '标题（列表与检索结果里显示）。' },
      content: { type: 'string', required: true, description: '正文（完整知识内容）。' },
      summary: { type: 'string', description: '一句话摘要（可选）。' },
      tags: { type: 'string', description: '标签，JSON 数组字符串，如 ["进度","EPC"]。' },
      source: { type: 'string', description: '来源标注（文件路径、会话主题等）。' },
    },
    output,
    async execute(args: unknown) {
      const { title, content, summary, tags, source } = args as Record<string, unknown>
      const card = resolveCard(plan)
      const body = typeof content === 'string' ? content.trim() : ''
      const name = typeof title === 'string' ? title.trim() : ''
      if (name === '') fail('调用错误：title 不能为空。')
      if (body === '') fail('调用错误：content 不能为空。')
      const [vector] = await embedTexts(ctx, card, [body])
      const outcome = createDocument(card.address, {
        title: name,
        content: body,
        summary: typeof summary === 'string' ? summary.trim() : '',
        tags: typeof tags === 'string' && tags.trim() !== '' ? tags.trim() : '[]',
        source: typeof source === 'string' ? source.trim() : '',
        vector: vector ?? [],
        embeddingModel: card.embeddingModel,
      })
      if ('code' in outcome) writeFault(outcome)
      return { ok: true, database: card.name, id: outcome.id, revision: outcome.revision }
    },
  })))

  // --- knowledge_search --------------------------------------------------
  disposers.push(ctx.tools.register(defineTool({
    name: 'knowledge_search',
    description: `在 RAG 知识库「${plan}」做向量近邻检索，返回 docId / 标题 / 摘要片段 / 距离 / 更新时间。`,
    parameters: {
      query: { type: 'string', required: true, description: '查询文本。' },
      k: { type: 'number', description: '返回条数（默认 5，上限 20）。' },
    },
    output,
    async execute(args: unknown) {
      const { query, k } = args as { query?: unknown, k?: unknown }
      const card = resolveCard(plan)
      const text = typeof query === 'string' ? query.trim() : ''
      if (text === '') fail('调用错误：查询文本不能为空。')
      const [vector] = await embedTexts(ctx, card, [text])
      const topK = Math.min(Math.max(Number(k) || 5, 1), 20)
      return { ok: true, database: card.name, results: searchByVector(card.address, vector ?? [], topK) }
    },
  })))

  // --- knowledge_get -----------------------------------------------------
  disposers.push(ctx.tools.register(defineTool({
    name: 'knowledge_get',
    description: `按 id 读取 RAG 知识库「${plan}」里的一条知识（正文 + 当前 revision）。更新/删除前先调用它。`,
    parameters: { id: { type: 'string', required: true, description: '文档 id（来自 search 或 list）。' } },
    output,
    async execute(args: unknown) {
      const { id } = args as { id?: unknown }
      const card = resolveCard(plan)
      const docId = typeof id === 'string' ? id.trim() : ''
      if (docId === '') fail('调用错误：id 不能为空。')
      const doc = getDocument(card.address, docId)
      if (doc === undefined) fail(`调用错误：知识库「${card.name}」中没有 id=${docId} 的条目。`)
      return { ok: true, database: card.name, document: { ...docJson(doc), content: doc.content } }
    },
  })))

  // --- knowledge_list ----------------------------------------------------
  disposers.push(ctx.tools.register(defineTool({
    name: 'knowledge_list',
    description: `分页列出 RAG 知识库「${plan}」里的知识条目（默认 active，按更新时间倒序）。`,
    parameters: {
      limit: { type: 'number', description: '每页条数（默认 20，上限 100）。' },
      offset: { type: 'number', description: '偏移量（默认 0）。' },
      status: { type: 'string', description: '状态过滤：active / superseded / archived / deleted（默认 active）。' },
      tag: { type: 'string', description: '按标签子串过滤（可选）。' },
    },
    output,
    async execute(args: unknown) {
      const { limit, offset, status, tag } = args as Record<string, unknown>
      const card = resolveCard(plan)
      const statusValue = typeof status === 'string' && status.trim() !== '' ? status.trim() : 'active'
      const rows = listDocuments(card.address, {
        limit: Number(limit) || 20,
        offset: Number(offset) || 0,
        status: statusValue,
        ...(typeof tag === 'string' && tag.trim() !== '' ? { tag: tag.trim() } : {}),
      })
      return {
        ok: true,
        database: card.name,
        status: statusValue,
        total: countDocuments(card.address, statusValue),
        documents: rows.map(docJson),
      }
    },
  })))

  // --- knowledge_update --------------------------------------------------
  disposers.push(ctx.tools.register(defineTool({
    name: 'knowledge_update',
    description: `更新 RAG 知识库「${plan}」里的一条知识（乐观锁：必须带当前 revision）。改 content 会重新计算向量。`,
    parameters: {
      id: { type: 'string', required: true, description: '文档 id。' },
      revision: { type: 'number', required: true, description: '当前 revision（来自 knowledge_get）。' },
      title: { type: 'string', description: '新标题（可选）。' },
      summary: { type: 'string', description: '新摘要（可选）。' },
      tags: { type: 'string', description: '新标签 JSON 数组（可选）。' },
      content: { type: 'string', description: '新正文（可选；提供则重算向量）。' },
    },
    output,
    async execute(args: unknown) {
      const { id, revision, title, summary, tags, content } = args as Record<string, unknown>
      const card = resolveCard(plan)
      const docId = typeof id === 'string' ? id.trim() : ''
      const expected = Number(revision)
      if (docId === '') fail('调用错误：id 不能为空。')
      if (!Number.isFinite(expected) || expected < 1) fail('调用错误：revision 必须是正整数（先调用 knowledge_get 获取）。')

      const body = typeof content === 'string' ? content.trim() : undefined
      let vector: number[] | undefined
      if (body !== undefined) {
        if (body === '') fail('调用错误：content 不能为空字符串（如需删除请用 knowledge_delete）。')
        const [embedded] = await embedTexts(ctx, card, [body])
        vector = embedded ?? []
      }
      const outcome = updateDocument(card.address, {
        id: docId,
        revision: expected,
        ...(typeof title === 'string' ? { title: title.trim() } : {}),
        ...(typeof summary === 'string' ? { summary: summary.trim() } : {}),
        ...(typeof tags === 'string' ? { tags: tags.trim() } : {}),
        ...(body === undefined ? {} : { content: body }),
        ...(vector === undefined ? {} : { vector, embeddingModel: card.embeddingModel }),
      })
      if (!outcome.ok) {
        if (outcome.reason === 'stale') {
          fail(`调用错误：revision 已过期（当前条目已被修改）。请重新 knowledge_get 后合并再提交。`)
        }
        if (outcome.reason === 'not-found') fail(`调用错误：知识库「${card.name}」中没有 id=${docId} 的有效条目。`)
        fail(`调用错误：向量维度不匹配——库为 ${outcome.expected} 维，模型产出 ${outcome.actual} 维。`)
      }
      return { ok: true, database: card.name, id: docId, revision: outcome.revision }
    },
  })))

  // --- knowledge_delete --------------------------------------------------
  disposers.push(ctx.tools.register(defineTool({
    name: 'knowledge_delete',
    description: `删除 RAG 知识库「${plan}」里的知识：默认软删（可审计），mode=hard 才真正移除正文与向量。按 id 删除。`,
    parameters: {
      id: { type: 'string', description: '单个文档 id。' },
      ids: { type: 'string', description: '多个文档 id，JSON 数组字符串，如 ["id1","id2"]。' },
      mode: { type: 'string', description: 'soft（默认）| hard。' },
    },
    output,
    async execute(args: unknown) {
      const { id, ids, mode } = args as Record<string, unknown>
      const card = resolveCard(plan)
      const list: string[] = []
      if (typeof id === 'string' && id.trim() !== '') list.push(id.trim())
      if (typeof ids === 'string' && ids.trim() !== '') {
        try {
          const parsed = JSON.parse(ids) as unknown
          if (Array.isArray(parsed)) list.push(...parsed.filter(one => typeof one === 'string').map(one => (one as string).trim()))
        } catch {
          fail('调用错误：ids 必须是 JSON 数组字符串。')
        }
      }
      if (list.length === 0) fail('调用错误：请提供 id 或 ids。')
      const modeValue = mode === 'hard' ? 'hard' : 'soft'
      const outcome = deleteDocuments(card.address, [...new Set(list)], modeValue)
      return { ok: true, database: card.name, mode: modeValue, deleted: outcome.deleted }
    },
  })))

  // --- 技能：激活才出现，卸载即消失 ---------------------------------------
  const skills = (ctx as unknown as { get<T>(name: string): T | undefined }).get<SkillRegistry>('skills')
  if (skills !== undefined) {
    disposers.push(skills.register({
      name: 'rag-knowledge',
      source: 'runtime',
      description: `RAG 知识库「${plan}」的使用方式：六个 CRUD 工具的使用时机、乐观锁与软删除约定。`,
      whenToUse: '需要新增、检索、修订或清理长期知识时加载。',
      content: skillContent(plan),
      invocation: { modelInvocable: true, userInvocable: false },
    }))
  }

  ctx.effect(() => () => {
    for (const dispose of disposers) dispose()
  }, 'rag-knowledge-tools: tools and skill')
}
