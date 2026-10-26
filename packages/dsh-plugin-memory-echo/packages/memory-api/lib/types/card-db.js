/** 角色卡 SQLite 存储：meta / self（己）/ memories（流水记忆）。 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AFFECT_PARAMS, SENTIMENT_PARAMS, RELATION_PARAMS, PARAMS, initialRelationship } from "./emotion.js";
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export function openCardDb(address) {
    const { getLoadablePath } = require('sqlite-vec');
    const db = new DatabaseSync(address, { allowExtension: true });
    try {
        db.loadExtension(getLoadablePath());
    }
    catch { /* 无扩展时仍可用普通表 */ }
    return db;
}
export function ensureCardSchema(db, dim = 512) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS self(
      id INTEGER PRIMARY KEY CHECK(id = 1),
      name TEXT NOT NULL DEFAULT '',
      persona TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS self_state(
      key TEXT PRIMARY KEY,
      value REAL NOT NULL DEFAULT 0.5,
      baseline REAL NOT NULL DEFAULT 0.4,
      floor REAL NOT NULL DEFAULT 0.05,
      ceiling REAL NOT NULL DEFAULT 0.9,
      half_life_seconds INTEGER NOT NULL DEFAULT 43200,
      sticky_until TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_state(
      session_id TEXT PRIMARY KEY,
      context_injected INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sleep_state(
      session_id TEXT PRIMARY KEY,
      sleeping INTEGER NOT NULL DEFAULT 0,
      wake_at TEXT,
      dream_at TEXT,
      dreamed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS emotion_event(
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      emotion TEXT NOT NULL,
      delta REAL NOT NULL,
      value_after REAL NOT NULL,
      cause_kind TEXT,
      cause_id TEXT,
      cause_text TEXT,
      source TEXT NOT NULL DEFAULT 'tool',
      target_kind TEXT NOT NULL DEFAULT 'self',
      target_id TEXT
    );
    CREATE INDEX IF NOT EXISTS emotion_event_ts ON emotion_event(ts);
    CREATE TABLE IF NOT EXISTS entities(
      id TEXT PRIMARY KEY,
      user_key TEXT UNIQUE,
      name TEXT NOT NULL,
      cognition TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    -- 人物 / 物 的态度维度与 self_state 同构：每个维度一个 0~1 浮点（喜爱、厌烦、生气、恶心、冷漠、信任）。
    CREATE TABLE IF NOT EXISTS entity_state(
      entity_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0.5,
      baseline REAL NOT NULL DEFAULT 0.4,
      floor REAL NOT NULL DEFAULT 0.05,
      ceiling REAL NOT NULL DEFAULT 0.95,
      half_life_seconds INTEGER NOT NULL DEFAULT 2592000,
      sticky_until TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(entity_id, key)
    );
    CREATE TABLE IF NOT EXISTS memories(
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      user_name TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      salience REAL NOT NULL DEFAULT 0.5,
      source TEXT,
      last_recalled_at TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS v_memories USING vec0(embedding float[${dim}]);
    CREATE TABLE IF NOT EXISTS meta(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS traits(
      key TEXT PRIMARY KEY,
      value REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS emotion_change_log(
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      scope TEXT NOT NULL,
      entity_id TEXT,
      entity_name TEXT,
      param TEXT NOT NULL,
      before REAL NOT NULL,
      delta REAL NOT NULL,
      after REAL NOT NULL,
      reason TEXT NOT NULL,
      cause_kind TEXT,
      cause_id TEXT,
      cause_text TEXT,
      message TEXT,
      appraisal TEXT
    );
    CREATE INDEX IF NOT EXISTS emotion_change_log_ts ON emotion_change_log(ts);
    CREATE TABLE IF NOT EXISTS lingering(
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      intensity REAL NOT NULL,
      expires_at TEXT NOT NULL,
      target_id TEXT,
      cause_text TEXT,
      created_at TEXT NOT NULL
    );
  `);
    migratePersonsObjects(db);
    migrateEntityShape(db);
    migrateEntityStateColumns(db);
    migrateSelfColumns(db);
    migrateSelfStateColumns(db);
    migrateSelfStateKeys(db);
    db.prepare('INSERT OR IGNORE INTO self(id, name, persona, updated_at) VALUES (1, ?, ?, ?)')
        .run('', '', new Date().toISOString());
    // 情绪/体力/活跃都是独立维度，可同时存在（高兴且愤怒）。
    const now = new Date().toISOString();
    // 旧版 30 维情绪模型已废弃：测试阶段直接清空旧状态（含关系与事件），
    // 只种子新的 PAD + 社会情感 + 关系四轴。
    const version = db.prepare("SELECT value FROM meta WHERE key = 'emotion_model'").get();
    if (version?.value !== '8') {
        db.exec('DELETE FROM self_state');
        db.exec('DELETE FROM entity_state');
        db.exec('DELETE FROM emotion_event');
        db.exec('DELETE FROM lingering');
        db.prepare("INSERT INTO meta(key, value) VALUES ('emotion_model', '8') ON CONFLICT(key) DO UPDATE SET value = '8'").run();
    }
    for (const [key, params] of Object.entries({ ...AFFECT_PARAMS, ...SENTIMENT_PARAMS })) {
        db.prepare(`INSERT OR IGNORE INTO self_state(key, value, baseline, floor, ceiling, half_life_seconds, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(key, params.baseline, params.baseline, params.floor, params.ceiling, params.halfLifeSeconds, now);
    }
    normalizeEntityAxes(db);
    for (const key of ['timidity', 'irritability', 'confidence', 'sensitivity']) {
        db.prepare('INSERT OR IGNORE INTO traits(key, value, updated_at) VALUES (?, 0, ?)').run(key, now);
    }
    migrateTraitsIntoState(db);
}
/** 旧 entities 结构（kind/aliases/category/description）→ name/cognition。 */
function migrateEntityShape(db) {
    const cols = new Set(db.prepare('PRAGMA table_info(entities)').all().map(row => row.name));
    if (!cols.has('kind') && !cols.has('description') && !cols.has('aliases') && !cols.has('category'))
        return;
    db.exec(`CREATE TABLE entities_next(
    id TEXT PRIMARY KEY,
    user_key TEXT UNIQUE,
    name TEXT NOT NULL,
    cognition TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`);
    const rows = db.prepare('SELECT id, user_key, name, aliases, category, description, updated_at FROM entities').all();
    const insert = db.prepare('INSERT INTO entities_next(id, user_key, name, cognition, updated_at) VALUES (?, ?, ?, ?, ?)');
    for (const row of rows) {
        const extras = [];
        if (row.aliases !== '' && row.aliases !== row.name)
            extras.push(`别名：${row.aliases}`);
        if (row.category !== '')
            extras.push(`类别：${row.category}`);
        const cognition = [row.description, ...extras].filter(part => part !== '').join('；');
        insert.run(row.id, row.user_key, row.name, cognition, row.updated_at);
    }
    db.exec('DROP TABLE entities');
    db.exec('ALTER TABLE entities_next RENAME TO entities');
}
/** 补齐旧对象缺失的关系轴：只插缺失项，不覆盖已有数值。 */
function normalizeEntityAxes(db) {
    const entities = db.prepare('SELECT id FROM entities').all();
    if (entities.length === 0)
        return;
    const initial = initialRelationship(db);
    const now = new Date().toISOString();
    for (const entity of entities) {
        for (const [key, value] of Object.entries(initial)) {
            db.prepare('INSERT OR IGNORE INTO entity_state(entity_id, key, value, updated_at) VALUES (?, ?, ?, ?)')
                .run(entity.id, key, value, now);
        }
    }
}
/** 旧 persons / objects 合并进 entities：迁移后删掉旧表。 */
function migratePersonsObjects(db) {
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    if (tables.has('persons')) {
        db.exec(`INSERT OR IGNORE INTO entities(id, kind, user_key, name, aliases, category, description, updated_at)
             SELECT id, 'person', user_key, name, aliases, '', description, updated_at FROM persons`);
        db.exec('DROP TABLE persons');
    }
    if (tables.has('objects')) {
        db.exec(`INSERT OR IGNORE INTO entities(id, kind, user_key, name, aliases, category, description, updated_at)
             SELECT id, 'object', NULL, name, '', category, description, updated_at FROM objects`);
        db.exec('DROP TABLE objects');
    }
}
/** self_traits 表废弃：可变项并入 self_state，其余（价值观）交给 persona。 */
function migrateTraitsIntoState(db) {
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='self_traits'").get();
    if (exists === undefined)
        return;
    const rows = db.prepare('SELECT key, value FROM self_traits').all();
    const now = new Date().toISOString();
    const mutable = new Set(['obsession', 'vengefulness', 'fanaticism', 'vanity', 'arrogance', 'inferiority', 'dependency', 'aggression', 'sadism']);
    for (const row of rows) {
        if (!mutable.has(row.key))
            continue;
        db.prepare('INSERT OR IGNORE INTO self_state(key, value, updated_at) VALUES (?, ?, ?)').run(row.key, row.value, now);
    }
    db.exec('DROP TABLE self_traits');
    for (const key of ['nostalgia', 'confusion', 'embarrassment', 'despair']) {
        db.prepare('DELETE FROM self_state WHERE key = ?').run(key);
    }
}
/** 旧 entity_state / emotion_event 补列。 */
function migrateEntityStateColumns(db) {
    const cols = new Set(db.prepare('PRAGMA table_info(entity_state)').all().map(row => row.name));
    const add = (name, ddl) => { if (!cols.has(name))
        db.exec(`ALTER TABLE entity_state ADD COLUMN ${ddl}`); };
    add('baseline', 'baseline REAL NOT NULL DEFAULT 0.4');
    add('floor', 'floor REAL NOT NULL DEFAULT 0.05');
    add('ceiling', 'ceiling REAL NOT NULL DEFAULT 0.95');
    add('half_life_seconds', 'half_life_seconds INTEGER NOT NULL DEFAULT 2592000');
    add('sticky_until', 'sticky_until TEXT');
    for (const [key, params] of Object.entries(RELATION_PARAMS)) {
        db.prepare('UPDATE entity_state SET baseline = ?, floor = ?, ceiling = ?, half_life_seconds = ? WHERE key = ?')
            .run(params.baseline, params.floor, params.ceiling, params.halfLifeSeconds, key);
    }
    const eventCols = new Set(db.prepare('PRAGMA table_info(emotion_event)').all().map(row => row.name));
    if (!eventCols.has('target_kind'))
        db.exec("ALTER TABLE emotion_event ADD COLUMN target_kind TEXT NOT NULL DEFAULT 'self'");
    if (!eventCols.has('target_id'))
        db.exec('ALTER TABLE emotion_event ADD COLUMN target_id TEXT');
    if (!eventCols.has('appraisal'))
        db.exec('ALTER TABLE emotion_event ADD COLUMN appraisal TEXT');
}
/** 旧 self_state 没有衰减参数列：补列并填默认。 */
function migrateSelfStateColumns(db) {
    const columns = new Set(db.prepare('PRAGMA table_info(self_state)').all().map(row => row.name));
    const add = (name, ddl) => { if (!columns.has(name))
        db.exec(`ALTER TABLE self_state ADD COLUMN ${ddl}`); };
    add('baseline', 'baseline REAL NOT NULL DEFAULT 0.4');
    add('floor', 'floor REAL NOT NULL DEFAULT 0.05');
    add('ceiling', 'ceiling REAL NOT NULL DEFAULT 0.9');
    add('half_life_seconds', 'half_life_seconds INTEGER NOT NULL DEFAULT 43200');
    add('sticky_until', 'sticky_until TEXT');
    // 记忆表补 last_recalled_at（回忆强化冷却）
    try {
        const memoryCols = new Set(db.prepare('PRAGMA table_info(memories)').all().map(row => row.name));
        if (memoryCols.size > 0 && !memoryCols.has('last_recalled_at'))
            db.exec('ALTER TABLE memories ADD COLUMN last_recalled_at TEXT');
    }
    catch { /* 表尚未建立 */ }
    // 睡眠表补 dream_at
    try {
        const sleepCols = new Set(db.prepare('PRAGMA table_info(sleep_state)').all().map(row => row.name));
        if (sleepCols.size > 0 && !sleepCols.has('dream_at'))
            db.exec('ALTER TABLE sleep_state ADD COLUMN dream_at TEXT');
    }
    catch { /* 表尚未建立 */ }
    // 已知状态的衰减参数是常量：每次打开都对齐，避免旧库停留在默认值。
    for (const [key, params] of Object.entries(PARAMS)) {
        db.prepare('UPDATE self_state SET baseline = ?, floor = ?, ceiling = ?, half_life_seconds = ? WHERE key = ?')
            .run(params.baseline, params.floor, params.ceiling, params.halfLifeSeconds, key);
    }
}
/** pleasure → contentment（满足），trust 不属于自身情绪：一次性迁移。 */
function migrateSelfStateKeys(db) {
    const rows = db.prepare('SELECT key FROM self_state').all();
    const keys = new Set(rows.map(row => row.key));
    if (keys.has('pleasure')) {
        if (keys.has('contentment'))
            db.prepare("DELETE FROM self_state WHERE key = 'pleasure'").run();
        else
            db.prepare("UPDATE self_state SET key = 'contentment' WHERE key = 'pleasure'").run();
    }
    if (keys.has('trust'))
        db.prepare("DELETE FROM self_state WHERE key = 'trust'").run();
}
/** 旧版 self 表带 mood/stamina/activity 列：迁移为 self_state 的 key-value。 */
function migrateSelfColumns(db) {
    const columns = db.prepare('PRAGMA table_info(self)').all();
    const names = new Set(columns.map(column => column.name));
    if (!names.has('mood'))
        return;
    const row = db.prepare('SELECT mood, stamina, activity FROM self WHERE id = 1').get();
    const now = new Date().toISOString();
    const put = db.prepare('INSERT OR REPLACE INTO self_state(key, value, updated_at) VALUES (?, ?, ?)');
    if (typeof row?.stamina === 'number')
        put.run('stamina', row.stamina, now);
    if (typeof row?.activity === 'number')
        put.run('activity', row.activity, now);
    db.exec(`
    ALTER TABLE self RENAME TO self_legacy;
    CREATE TABLE self(
      id INTEGER PRIMARY KEY CHECK(id = 1),
      name TEXT NOT NULL DEFAULT '',
      persona TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    INSERT INTO self(id, name, persona, updated_at)
      SELECT 1, name, persona, updated_at FROM self_legacy;
    DROP TABLE self_legacy;
  `);
}
export function writeMeta(db, key, value) {
    db.prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
export function readMeta(db, key) {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row?.value ?? '';
}
/** 从 DB 读取完整卡片数据。 */
export function readCard(address) {
    let db;
    try {
        db = openCardDb(address);
        const self = db.prepare('SELECT name, persona FROM self WHERE id = 1').get();
        return {
            name: String(self?.name ?? ''),
            persona: String(self?.persona ?? ''),
        };
    }
    catch {
        return undefined;
    }
    finally {
        db?.close();
    }
}
/** 把卡片字段写回 DB（含 seed 记忆重建）。 */
export function writeCard(address, data, dim = 512) {
    const db = openCardDb(address);
    try {
        ensureCardSchema(db, dim);
        db.exec('BEGIN');
        try {
            db.prepare('UPDATE self SET name = ?, persona = ?, updated_at = ? WHERE id = 1')
                .run(data.name, data.persona, new Date().toISOString());
            db.exec('COMMIT');
        }
        catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }
    finally {
        db.close();
    }
}
/** 新建一个空数据库文件并初始化 schema。 */
export function createCardDb(address) {
    mkdirSync(dirname(address), { recursive: true });
    const db = openCardDb(address);
    try {
        ensureCardSchema(db);
    }
    finally {
        db.close();
    }
}
//# sourceMappingURL=card-db.js.map