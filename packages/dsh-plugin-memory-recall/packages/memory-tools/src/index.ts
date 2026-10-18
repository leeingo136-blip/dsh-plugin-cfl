/**
 * Memory-recall toolset: the six card-facing tools.
 *
 * Placement follows the preset machinery: this component is a plain plugin
 * (`inject: ['tools']`) that preset trees opt into — the loop is never
 * touched; a preset that lists the row gets the tools, one that drops it
 * does not. All six executes are placeholders for now: they validate their
 * arguments and report not-implemented, so presets can ship the tool
 * surface while the actual linking (sqlite-vec open, HTTP transport,
 * embedding calls) lands incrementally.
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

export const inject = ['tools']

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

const output = {
  schema: { type: 'json' } as const,
  render: (_args: unknown, value: unknown): { type: 'text'; text: string }[] =>
    [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

/** The card handle every knowledge_* tool takes (the unique card name). */
const databaseParam = {
  type: 'string',
  required: true,
  description: '目标记忆库卡片的名称（记忆回想设置中配置的唯一名称）。',
} as const

export function apply(ctx: Context): void {
  const knowledgeAdd = defineTool({
    name: 'knowledge_add',
    description: '向指定的 RAG 记忆库添加文本条目（自动向量化后入库）。',
    parameters: {
      database: databaseParam,
      texts: { type: 'string', required: true, description: '要入库的文本，多行以 \\n 分隔。' },
    },
    output,
    async execute() {
      return { ok: false, note: PENDING }
    },
  })

  const knowledgeSearch = defineTool({
    name: 'knowledge_search',
    description: '在指定的 RAG 记忆库中做向量近邻检索，返回最相关的条目。',
    parameters: {
      database: databaseParam,
      query: { type: 'string', required: true, description: '查询文本。' },
      k: { type: 'number', description: '返回条数（默认 5）。' },
    },
    output,
    async execute() {
      return { ok: false, note: PENDING }
    },
  })

  const knowledgeDelete = defineTool({
    name: 'knowledge_delete',
    description: '从指定的 RAG 记忆库中删除条目。',
    parameters: {
      database: databaseParam,
      query: { type: 'string', description: '按内容匹配删除的查询文本。' },
      all: { type: 'boolean', description: '清空该记忆库全部条目。' },
    },
    output,
    async execute() {
      return { ok: false, note: PENDING }
    },
  })

  const memoryRecall = defineTool({
    name: 'memory_recall',
    description: '跨记忆库回想：按查询文本在多张卡片（缺省为全部卡片）中检索相关记忆。',
    parameters: {
      query: { type: 'string', required: true, description: '回想查询文本。' },
      databases: { type: 'string', description: '限定检索的卡片名称列表，逗号分隔；缺省检索全部。' },
      k: { type: 'number', description: '每库返回条数（默认 5）。' },
    },
    output,
    async execute() {
      return { ok: false, note: PENDING }
    },
  })

  const memoryAdd = defineTool({
    name: 'memory_add',
    description: '写入一条记忆：缺省进入默认记忆卡片，也可指定目标卡片。',
    parameters: {
      text: { type: 'string', required: true, description: '要记住的内容。' },
      database: { type: 'string', description: '目标卡片名称；缺省用默认记忆卡片。' },
    },
    output,
    async execute() {
      return { ok: false, note: PENDING }
    },
  })

  const dream = defineTool({
    name: 'dream',
    description: '整理与巩固记忆：对记忆库做归纳、去重、摘要（梦境整理）。',
    parameters: {},
    output,
    async execute() {
      return { ok: false, note: PENDING }
    },
  })

  const disposers = [
    ctx.tools.register(knowledgeAdd),
    ctx.tools.register(knowledgeSearch),
    ctx.tools.register(knowledgeDelete),
    ctx.tools.register(memoryRecall),
    ctx.tools.register(memoryAdd),
    ctx.tools.register(dream),
  ]
  ctx.effect(() => () => {
    for (const dispose of disposers) dispose()
  }, 'memory-recall-tools: card tools')
}
