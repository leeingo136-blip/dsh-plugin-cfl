/** 主题词权重：第一个 10 分，逐个递减，第 10 个 1 分（超过 10 个由调用方截断）。 */
export function topicWeight(index) {
    return Math.max(1, 10 - index);
}
/** 大小写不敏感的子串出现次数（中文按原文逐次匹配）。 */
export function countTopic(content, topic) {
    const needle = topic.toLowerCase().trim();
    if (needle === '')
        return 0;
    const haystack = content.toLowerCase();
    let count = 0;
    let pos = haystack.indexOf(needle);
    while (pos !== -1) {
        count += 1;
        pos = haystack.indexOf(needle, pos + needle.length);
    }
    return count;
}
/** 主题词频率的加权统计：Σ(出现次数 × 权重)。 */
export function weightedFrequency(content, topics) {
    let total = 0;
    for (const [index, topic] of topics.entries()) {
        total += countTopic(content, topic) * topicWeight(index);
    }
    return total;
}
/** 满分 100 的两块构成：相关性 70 + 时间 30。 */
const RELEVANCE_POINTS = 70;
const TIME_POINTS = 30;
function timestampOf(addedAt) {
    const ts = Date.parse(addedAt);
    return Number.isNaN(ts) ? 0 : ts;
}
/**
 * 打分：相关性 = 加权频率 / 候选内最高加权频率 × 70；时间 = 候选内时间跨度
 * 线性归一化 × 30（跨度为零且多于一条时取中间值）。返回按总分降序
 * （平局新者优先）。
 */
export function scoreRows(rows, topics) {
    const scored = rows.map(row => ({ row, freq: weightedFrequency(row.content, topics), relevance: 0, timeScore: 0, score: 0 }));
    let maxFreq = 0;
    for (const one of scored)
        maxFreq = Math.max(maxFreq, one.freq);
    let minTs = Number.POSITIVE_INFINITY;
    let maxTs = Number.NEGATIVE_INFINITY;
    const timestamps = scored.map(one => {
        const ts = timestampOf(one.row.addedAt);
        minTs = Math.min(minTs, ts);
        maxTs = Math.max(maxTs, ts);
        return ts;
    });
    const span = maxTs - minTs;
    for (const [index, one] of scored.entries()) {
        one.relevance = maxFreq > 0 ? (one.freq / maxFreq) * RELEVANCE_POINTS : 0;
        one.timeScore = span > 0
            ? ((timestamps[index] ?? minTs) - minTs) / span * TIME_POINTS
            : (scored.length > 1 ? TIME_POINTS / 2 : TIME_POINTS);
        one.score = Math.round((one.relevance + one.timeScore) * 10) / 10;
    }
    return scored.sort((a, b) => b.score - a.score || timestampOf(b.row.addedAt) - timestampOf(a.row.addedAt));
}
/**
 * 自种子沿时间顺序向前后两个方向外推：相邻切片的加权频率未明显下降
 * （≥ dropRatio × 种子频率且 > 0）则纳入并继续推进，第一次明显下降即停。
 * 锚点始终是种子频率，避免低频切片之间的连锁漂移；种子自身频率为零时
 * 不扩选。返回选中的行下标（含种子），按输入的时间顺序排列。
 */
export function expandAdjacent(rows, seedIndex, topics, options = {}) {
    const dropRatio = options.dropRatio ?? 0.5;
    const maxSteps = options.maxSteps ?? 5;
    const seed = rows[seedIndex];
    if (seed === undefined)
        return [];
    const seedFreq = weightedFrequency(seed.content, topics);
    const chosen = new Set([seedIndex]);
    if (seedFreq <= 0)
        return [seedIndex];
    for (const direction of [-1, 1]) {
        let steps = 0;
        let cursor = seedIndex;
        while (steps < maxSteps) {
            const next = rows[cursor + direction];
            if (next === undefined)
                break;
            const freq = weightedFrequency(next.content, topics);
            if (freq <= 0 || freq < seedFreq * dropRatio)
                break;
            chosen.add(cursor + direction);
            cursor += direction;
            steps += 1;
        }
    }
    return [...chosen].sort((a, b) => a - b);
}
//# sourceMappingURL=recall.js.map