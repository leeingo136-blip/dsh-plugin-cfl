import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { JsonValue } from '@deepseek-ai/dsh-util-values';
import zschema from '@deepseek-ai/schemastery';
/** Shared with the toolset package: it opens the same cards this controller manages. */
export { ConnectionStore, dataRoot, localDatabaseDir, migrateLegacyCards } from './connections.ts';
export { ensureCardSchema, openCardDb } from './card-db.ts';
export { activeLingering, applyAppraisal, applyTraitDelta, traitProfile, TRAIT_KEYS, type TraitKey, type TraitProfile, currentEmotionIntensity, decayAll, decayEntityAll, derivedEmotionLabels, dispositionOf, emotionProfile, initialRelationship, sensitivityOf, lingeringProfile, relationshipProfile, saveDisposition, stageIndex, stageLabel, valenceLevel, VALENCE_LEVELS, type Appraisal, type LingeringEntry, type Disposition, type ParameterProfile, type Stage } from './emotion.ts';
export { dedupeDreams, dedupeMemories } from './consolidate.ts';
export { backfillMemories } from './backfill.ts';
export type { ConnectionFault, ConnectionInput, ConnectionRecord } from './connections.ts';
export { clearChunks, deleteByContent, ensureLocalDatabase, insertChunks, listChunks, listDreams, openDb, queryLocal } from './query.ts';
export type { ChunkInput, ChunkMeta, DeleteOutcome, DreamEntry, QueryHit, RecallRow, WriteFault } from './query.ts';
export { countTopic, expandAdjacent, scoreRows, topicWeight, weightedFrequency } from './recall.ts';
export type { ExpandOptions, ScoredRow } from './recall.ts';
export declare const name = "memory-api";
/** The schema class instance type, nameable without dragging cosmokit in. */
type SchemaNode = InstanceType<typeof zschema>;
/**
 * No runtime settings surface of our own (v1); the schema stays because the
 * loader always mounts one.
 */
export declare const Config: SchemaNode;
/**
 * Host service backing the generated `ctx.remote['memory-echo']` namespace.
 * @typert service memoryEchoController
 */
export declare class MemoryRecallController extends TypertRemoteService {
    private store;
    constructor(ctx: Context);
    /** One lazy optional-service lookup, untyped at the boundary. */
    private svc;
    /** 现有工作区列表（供卡片下拉选择）。 */
    workspaceOptions(): Promise<JsonValue>;
    /** 现有 agent 预设列表（供卡片选择基础预设）。 */
    presetOptions(): Promise<JsonValue>;
    /** 在系统文件管理器中定位数据库文件。 */
    openDatabaseLocation(input: JsonValue): Promise<JsonValue>;
    /** 创建角色会话：把 seed / 库最近片段作为会话创建时的初始历史。 */
    createCharacterSession(input: JsonValue): Promise<JsonValue>;
    /** 读取最近的梦（来自向量库 kind='dream'），供设置页回顾。 */
    dreamList(input: JsonValue): Promise<JsonValue>;
    /** 列出本地 databases 目录下可载入的数据库文件。 */
    databaseFiles(): Promise<JsonValue>;
    /** 读取指定数据库的人物内容（姓名/角色介绍）。 */
    loadDatabase(input: JsonValue): Promise<JsonValue>;
    /** 读取角色的情感基调与增减系数。 */
    cardDisposition(input: JsonValue): Promise<JsonValue>;
    /** 修改情感基调 / 增减系数（只传想改的键）。 */
    setCardDisposition(input: JsonValue): Promise<JsonValue>;
    /** 修改己状态中的某一维度（0~1 浮点）。 */
    setSelfState(input: JsonValue): Promise<JsonValue>;
    /** 情绪变动日志（最近的在前）。 */
    emotionChangeLog(input: JsonValue): Promise<JsonValue>;
    /** 列出人/物（含态度），query 按名称/别名过滤。 */
    listEntities(input: JsonValue): Promise<JsonValue>;
    /** 新增/更新一条人/物。 */
    saveEntity(input: JsonValue): Promise<JsonValue>;
    /** 删除一条人/物及其态度。 */
    deleteEntity(input: JsonValue): Promise<JsonValue>;
    /** 修改某人/物某个态度维度的值。 */
    setEntityState(input: JsonValue): Promise<JsonValue>;
    /** 应用一次评价并记录归因（同一事务）。 */
    emotionApply(input: JsonValue): Promise<JsonValue>;
    /** 当前情绪（已惰性衰减）+ 最近归因事件。 */
    emotionState(input: JsonValue): Promise<JsonValue>;
    /**
     * 由数据库里的情绪数据派生极端/二次元情绪标签（只读、规则推导）。
     * 标签不是存储值，随时可按当前数值重算。
     */
    emotionTags(input: JsonValue): Promise<JsonValue>;
    /** 列出记忆（不含向量），query 按正文过滤。 */
    listMemories(input: JsonValue): Promise<JsonValue>;
    /** 新增一条记忆（暂不写入向量）。 */
    addMemory(input: JsonValue): Promise<JsonValue>;
    /** 删除一条记忆（含向量行，若存在）。 */
    deleteMemory(input: JsonValue): Promise<JsonValue>;
    /** 读取卡片库里的己状态与物（含态度维度），供设置页表格展示。 */
    cardState(input: JsonValue): Promise<JsonValue>;
    /** 只创建/合并预设，不创建会话（「前世」注入在会话启动时自动发生）。 */
    createCharacterPreset(input: JsonValue): Promise<JsonValue>;
    /**
     * 为所有角色卡生成独立预设文件（插件本地 data/presets/characters.yml）。
     * 只写 preset 行，不含安装级组件；由 profile 里一条 include 引用加载。
     */
    generatePresets(): Promise<JsonValue>;
    /** Every saved connection card, plus editor defaults (local dir inside the plugin). */
    connList(): Promise<JsonValue>;
    /** Create one connection card (the name must be unique — tools use it as the handle). */
    connCreate(input: JsonValue): Promise<JsonValue>;
    /** Update one connection card in place (unique-name check skips itself). */
    connUpdate(input: JsonValue): Promise<JsonValue>;
    /** Delete one connection card. */
    connDelete(input: JsonValue): Promise<JsonValue>;
    /**
     * The embedding model catalog for the card editor's engine picker; empty
     * (not an error) when the embedding service is absent, so the editor
     * stays usable and the UI shows a hint instead.
     */
    embeddingModels(): Promise<JsonValue>;
    /**
     * KNN search over one card's database: embed the query with the card's
     * bound engine, then run a top-k nearest-neighbour query. Local cards
     * search the sqlite-vec file at `address`; service cards are not
     * implemented yet (the tools own that transport later).
     */
    connQuery(input: JsonValue): Promise<JsonValue>;
}
/**
 * 把角色卡注册成 agent 预设。同名预设一律不覆盖：已存在即记入 conflicts，
 * 由界面弹窗提示「有同名预设，无法创建」。
 */
export declare function registerCharacterPresets(ctx: Context, only?: readonly string[]): Promise<string[]>;
export declare function apply(ctx: Context): Promise<void>;
//# sourceMappingURL=index.d.ts.map