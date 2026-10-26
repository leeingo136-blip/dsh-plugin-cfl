/**
 * Shared memory-card access for the rag-knowledge capability.
 *
 * The tools, the per-turn writer and the idle dream all read the same
 * 「记忆回想」card registry and embed through the same bound engine. Keeping
 * the two lookups here means a card rename, a service rename, or the
 * local-only rule is changed in exactly one place.
 *
 * @module rag-knowledge-tools/cards
 */
import type { Context } from '@deepseek-ai/cordis'
import { ConnectionStore, type ConnectionRecord } from '@dsh/api-rag-knowledge'

/** The card registry — the same JSON store the 设置 → 记忆回想 editor manages. */
export const store = new ConnectionStore()

/** The minimal embedding face this capability consumes (the local plugin's service). */
export interface EmbeddingService {
  embed(inputs: readonly string[], modelId?: string): Promise<number[][]>
}

/** One lazy optional-service lookup, untyped at the boundary. */
export interface HostContext {
  get<T = unknown>(name: string): T | undefined
}

/** Resolve one card by its unique name; only local files are supported for now. */
export function resolveCard(name: string): ConnectionRecord {
  const card = store.list().find(one => one.name === name)
  if (card === undefined) {
    throw new Error(`方案「${name}」不存在:RAG 知识库里没有这个方案。请先在 设置 → RAG 知识库 创建同名方案，再调用本工具。`)
  }
  if (card.kind === 'service') {
    throw new Error(`方案「${name}」是网络服务类型，工具读写暂未实现。请改用本地方案。`)
  }
  return card
}

/** Embed texts through the card's bound engine; the service is optional by design. */
export async function embedTexts(
  ctx: Context,
  card: ConnectionRecord,
  inputs: readonly string[],
): Promise<number[][]> {
  const embedding = (ctx as unknown as HostContext).get<EmbeddingService>('embedding')
  if (embedding === undefined) {
    throw new Error('embedding 服务不可用——请先在账号页启用本地向量模型。')
  }
  const vectors = await embedding.embed(inputs, card.embeddingModel === '' ? undefined : card.embeddingModel)
  if (!Array.isArray(vectors) || vectors.length !== inputs.length ||
      vectors.some(vector => !Array.isArray(vector) || vector.length === 0)) {
    throw new Error('查询向量生成失败（embedding 服务返回异常）。')
  }
  return vectors
}
