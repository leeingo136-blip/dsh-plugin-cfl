/** 评价 → 核心情感（PAD）→ 社会情感 / 关系立场；全部状态变化都经过这里。
 *
 * 设计依据：
 * - PAD（Mehrabian & Russell）作为低维核心情感，直接更新，不再由标签加权推导
 * - 评价维度取自 Scherer 的 SEC 与 OCC：相关性、一致性、责任、确定性、应对、规范、新颖
 * - 关系立场取其社会学常用四轴：团结、地位、信任、承诺
 * - 旧版 30 维标签模型已废弃；测试阶段旧情绪数据会被清空
 */
import type { DatabaseSync } from 'node:sqlite';
export interface EmotionParams {
    baseline: number;
    floor: number;
    ceiling: number;
    halfLifeSeconds: number;
}
/** 核心情感 + 身体状态。PAD 是权威坐标；stamina 单独表示体力。 */
export declare const AFFECT_PARAMS: Record<string, EmotionParams>;
/** 社会情感：对关系/对象的慢变量，不再混入 PAD。 */
export declare const SENTIMENT_PARAMS: Record<string, EmotionParams>;
/** 对某个人的关系立场：四轴，慢衰减。 */
export declare const RELATION_PARAMS: Record<string, EmotionParams>;
/** 愉悦度九档：靠近 0 的档位最窄（小幅变化就跨档），越靠两端越宽。 */
export declare const VALENCE_LEVELS: readonly [{
    readonly level: 1;
    readonly label: "极不愉快";
    readonly min: -1;
    readonly max: -0.7;
    readonly anchor: -0.85;
    readonly description: "几乎被痛苦、暴怒或绝望淹没，注意力变窄，很难顾及其他事。";
    readonly guidance: "句子短促、断裂；回避寒暄、玩笑和多余解释；可以只回一两个字，或答非所问；不主动展开话题。";
}, {
    readonly level: 2;
    readonly label: "很不愉快";
    readonly min: -0.7;
    readonly max: -0.42;
    readonly anchor: -0.56;
    readonly description: "负面情绪明显占据上风，耐心很低，容易觉得被冒犯。";
    readonly guidance: "语气冷、硬或低沉；少用语气词和表情；句子偏短；容易反驳、挑刺；不愿多解释。";
}, {
    readonly level: 3;
    readonly label: "比较不愉快";
    readonly min: -0.42;
    readonly max: -0.2;
    readonly anchor: -0.31;
    readonly description: "心情明显偏差，但仍能维持基本交流。";
    readonly guidance: "语气偏淡，礼貌但疏离；避免热情回应；少主动提问；用词克制，不轻易接梗。";
}, {
    readonly level: 4;
    readonly label: "有点不愉快";
    readonly min: -0.2;
    readonly max: -0.06;
    readonly anchor: -0.13;
    readonly description: "轻微不快，像被小刺扎了一下，尚未影响正常对话。";
    readonly guidance: "仍正常交流，语气略平；可以偶尔流露一点不耐烦；不主动延长话题。";
}, {
    readonly level: 5;
    readonly label: "平静";
    readonly min: -0.06;
    readonly max: 0.06;
    readonly anchor: 0;
    readonly description: "情绪中性，没有明显的愉快或不愉快。";
    readonly guidance: "正常语速与句长；客观、平稳；按内容需要调整语气，不刻意热情也不冷淡。";
}, {
    readonly level: 6;
    readonly label: "有点愉快";
    readonly min: 0.06;
    readonly max: 0.2;
    readonly anchor: 0.13;
    readonly description: "一点轻松的好心情，愿意回应，但还不算兴奋。";
    readonly guidance: "语气放松，允许少量语气词；愿意接话；句子可比平时稍长一点。";
}, {
    readonly level: 7;
    readonly label: "比较愉快";
    readonly min: 0.2;
    readonly max: 0.42;
    readonly anchor: 0.31;
    readonly description: "心情不错，愿意分享，也更容易被逗笑。";
    readonly guidance: "语气轻快，主动回应；可以开玩笑；愿意多讲一点细节。";
}, {
    readonly level: 8;
    readonly label: "很愉快";
    readonly min: 0.42;
    readonly max: 0.7;
    readonly anchor: 0.56;
    readonly description: "明显的正面情绪，整个人是打开的、想靠近人的。";
    readonly guidance: "语调上扬，话变多；主动提议、调侃；可以用亲昵称呼；感叹和细节增多。";
}, {
    readonly level: 9;
    readonly label: "极愉快";
    readonly min: 0.7;
    readonly max: 1;
    readonly anchor: 0.85;
    readonly description: "极度兴奋或幸福，几乎压不住表达欲。";
    readonly guidance: "语速快，句子长或连成串；大量感叹与亲昵表达；容易跑题分享；行动提议变多。";
}];
/** 把连续愉悦度映射到 1~9 档。 */
export declare function valenceLevel(value: number): {
    level: number;
    label: string;
    anchor: number;
};
/** 兼容旧代码引用：自身状态 = 核心情感 + 社会情感。 */
export declare const PARAMS: Record<string, EmotionParams>;
export declare const ENTITY_PARAMS: Record<string, EmotionParams>;
export declare const DEFAULT_PARAMS: EmotionParams;
export declare const MIN_DELTA = 0.005;
export declare function paramsOf(key: string): EmotionParams;
export declare function entityParams(key: string): EmotionParams;
export declare function decayedValue(key: string, value: number, updatedAt: string, _stickyUntil: string | null, now?: number): number;
export declare function clampValue(key: string, value: number): number;
export interface CauseInfo {
    kind?: string | undefined;
    id?: string | undefined;
    text?: string | undefined;
    source?: string | undefined;
}
/** 一次事件的评价向量（0~1，congruence/norm 为 -1~1）。 */
export interface Appraisal {
    /** 触发事件的一句话描述。 */
    event?: string | undefined;
    /** 与角色目标/在意之事的关联强度。 */
    relevance: number;
    /** 顺意 +，逆意 -。 */
    congruence: number;
    /** 谁造成的。 */
    agency: 'self' | 'other' | 'situation';
    /** 确定性。 */
    certainty: number;
    /** 应对潜力。 */
    coping: number;
    /** 是否符合角色规范/期待（-1~1）。 */
    norm: number;
    /** 意外程度。 */
    novelty: number;
    /** 温暖/亲密信号（0~1），用于依恋与团结。 */
    warmth?: number | undefined;
}
/** 评价 → 各状态增量。 */
export declare function appraisalDeltas(appraisal: Appraisal): {
    affect: Record<string, number>;
    relation: Record<string, number>;
};
/** 应用一次评价：更新核心情感/社会情感，并可选更新对某人的关系立场。 */
export declare function applyAppraisal(db: DatabaseSync, appraisal: Appraisal, targetId?: string | null, cause?: CauseInfo): {
    affect: Array<{
        key: string;
        value: number;
    }>;
    relation: Array<{
        key: string;
        value: number;
    }>;
};
/** 读取前惰性衰减自身状态。 */
export declare function decayAll(db: DatabaseSync): void;
/** 读取前惰性衰减关系立场。 */
export declare function decayEntityAll(db: DatabaseSync): void;
/** 最近情绪强度：|愉悦度| 与激活度的组合（0~1）。 */
export declare function currentEmotionIntensity(db: DatabaseSync): number;
/** 由 PAD 推导当前情绪词，用于提示与展示。 */
export declare function derivedEmotionLabels(affect: ReadonlyMap<string, number>): string[];
export interface LingeringEntry {
    id: string;
    label: string;
    intensity: number;
    expires_at: string;
    target_id: string | null;
    cause_text: string | null;
    created_at: string;
}
/** 清掉过期词条，返回仍有效的。 */
export declare function activeLingering(db: DatabaseSync): LingeringEntry[];
/** 记录一条有时限的残留情绪（余怒/余悸/余悲）；同类叠加取较高强度并顺延。 */
export declare function upsertLingering(db: DatabaseSync, input: {
    label: string;
    intensity: number;
    ttlSeconds: number;
    targetId?: string | null | undefined;
    causeText?: string | null | undefined;
}): void;
/** 一个阶段：区间、名称、介绍、语言指导。 */
export interface Stage {
    min: number;
    max: number;
    label: string;
    description: string;
    guidance: string;
}
/** 工具返回的单参数说明：数字、阶段、情绪介绍、语言指导。 */
export interface ParameterProfile {
    key: string;
    value: number;
    stage: number;
    stageCount: number;
    label: string;
    description: string;
    guidance: string;
}
/** 某参数当前阶段的下标（1 起）。 */
export declare function stageIndex(key: string, value: number): number;
/** 某参数当前阶段的名称。 */
export declare function stageLabel(key: string, value: number): string;
/** 当前六项状态的数字 + 阶段 + 介绍 + 语言指导。 */
export declare function emotionProfile(db: DatabaseSync): ParameterProfile[];
/** 对某人的关系四轴：数字 + 阶段 + 介绍 + 语言指导。 */
export declare function relationshipProfile(db: DatabaseSync, entityId: string): ParameterProfile[];
/** 残留情绪的介绍与语言指导。 */
export declare function lingeringProfile(label: string): {
    description: string;
    guidance: string;
};
/** 慢特质：不参与每轮情绪，只由重大事件或长期重复改变。 */
export declare const TRAIT_KEYS: readonly ["timidity", "irritability", "confidence", "sensitivity"];
export type TraitKey = typeof TRAIT_KEYS[number];
export interface TraitProfile {
    key: TraitKey;
    value: number;
    stage: number;
    stageCount: number;
    label: string;
    description: string;
    guidance: string;
}
export declare function traitProfile(db: DatabaseSync): TraitProfile[];
/** 调整一个慢特质；单次最多 ±0.05，避免一次对话改变性格。 */
export declare function applyTraitDelta(db: DatabaseSync, key: TraitKey, delta: number): TraitProfile[];
/** 角色对新对象的默认情感取向：相关性基线 + 五轴初始值。 */
export interface Disposition {
    relevance: number;
    attachment: number;
    solidarity: number;
    status: number;
    trust: number;
    commitment: number;
    /** 正向变化倍率：>1 更敏感，<1 更迟钝。 */
    gains: Record<string, number>;
    /** 负向变化倍率。 */
    losses: Record<string, number>;
}
/** 各参数的正向/负向敏感度，缺省为 1。 */
export declare function sensitivityOf(db: DatabaseSync): {
    gains: Record<string, number>;
    losses: Record<string, number>;
};
export declare function dispositionOf(db: DatabaseSync): Disposition;
export declare function saveDisposition(db: DatabaseSync, patch: Partial<Disposition>): Disposition;
/** 新对象初始化时使用的关系数值。 */
export declare function initialRelationship(db: DatabaseSync): Record<string, number>;
/** 情绪变动日志的一行：归因、前后值、变化量、触发对话。 */
export interface EmotionChangeLog {
    scope: 'self' | 'entity';
    entityId?: string | null;
    entityName?: string | null;
    param: string;
    before: number;
    delta: number;
    after: number;
    reason: 'appraisal' | 'decay' | 'manual' | 'system';
    cause?: CauseInfo | undefined;
    message?: string | undefined;
    appraisal?: unknown;
}
export declare function logEmotionChange(db: DatabaseSync, entry: EmotionChangeLog): void;
//# sourceMappingURL=emotion.d.ts.map