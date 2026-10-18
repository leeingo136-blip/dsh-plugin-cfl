/**
 * Memory-recall scoring primitives — pure functions over fetched rows, no
 * I/O, so the tool layer only orchestrates (embed, fetch, glue) and the
 * algorithm stays unit-testable.
 *
 * The experiment's contract: the model condenses what it wants to remember
 * into ordered topic words (first = most important). A slice's relevance is
 * the frequency-weighted count of its topic words — earlier words weigh more
 * (10 down to 1) — normalized to 70 points; recency across the candidate set
 * fills the remaining 30. The top three seeds then grow along *time-adjacent*
 * slices in both directions: a neighbour joins while its weighted frequency
 * has not clearly dropped relative to the seed, and the walk stops at the
 * first clear drop, so each output memory is a coherent run of slices.
 */
import type { RecallRow } from './query.ts';
/** 主题词权重：第一个 10 分，逐个递减，第 10 个 1 分（超过 10 个由调用方截断）。 */
export declare function topicWeight(index: number): number;
/** 大小写不敏感的子串出现次数（中文按原文逐次匹配）。 */
export declare function countTopic(content: string, topic: string): number;
/** 主题词频率的加权统计：Σ(出现次数 × 权重)。 */
export declare function weightedFrequency(content: string, topics: readonly string[]): number;
/** 打分结果：一行切片带上频率与两部分得分。 */
export interface ScoredRow {
    row: RecallRow;
    /** 加权主题词频率（原始值，未归一化）。 */
    freq: number;
    /** 相关性得分（0~70）。 */
    relevance: number;
    /** 时间新鲜度得分（0~30）。 */
    timeScore: number;
    /** 总分（满分 100，保留一位小数）。 */
    score: number;
}
/**
 * 打分：相关性 = 加权频率 / 候选内最高加权频率 × 70；时间 = 候选内时间跨度
 * 线性归一化 × 30（跨度为零且多于一条时取中间值）。返回按总分降序
 * （平局新者优先）。
 */
export declare function scoreRows(rows: readonly RecallRow[], topics: readonly string[]): ScoredRow[];
/** 相邻切片扩选参数。 */
export interface ExpandOptions {
    /** 「明显下降」的比例线：相邻频率低于种子的该比例即停止（默认 0.5，即掉到一半以下）。 */
    dropRatio?: number;
    /** 单方向最多外推的切片数（默认 5）。 */
    maxSteps?: number;
}
/**
 * 自种子沿时间顺序向前后两个方向外推：相邻切片的加权频率未明显下降
 * （≥ dropRatio × 种子频率且 > 0）则纳入并继续推进，第一次明显下降即停。
 * 锚点始终是种子频率，避免低频切片之间的连锁漂移；种子自身频率为零时
 * 不扩选。返回选中的行下标（含种子），按输入的时间顺序排列。
 */
export declare function expandAdjacent(rows: readonly RecallRow[], seedIndex: number, topics: readonly string[], options?: ExpandOptions): number[];
//# sourceMappingURL=recall.d.ts.map