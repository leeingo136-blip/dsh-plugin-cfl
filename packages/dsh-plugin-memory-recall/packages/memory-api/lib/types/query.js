/**
 * The local RAG vector store: one sqlite file per card, sqlite-vec for the
 * embedding column, ordinary SQL for everything else.
 *
 * The on-disk schema is the contract shared by the knowledge tools (write
 * side, this module) and the query paths (UI modal, knowledge_search):
 * a `chunks` side table keeps the plain text plus the `added_at` insertion
 * timestamp (ISO 8601 — any non-vector listing orders by it, newest first),
 * and the `v_chunks` vec0 virtual table carries the embedding, joined by
 * rowid. Databases are created on demand: every entry point runs
 * `ensureLocalDatabase` first, so a card whose file was deleted (or never
 * written yet) heals itself instead of erroring. Connections are
 * short-lived — open, one statement batch, close.
 *
 * `node:sqlite` + the `sqlite-vec` npm extension binary; no native module
 * of our own.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
/** sqlite-vec resolves from this package's own dependency tree. */
const require = createRequire(import.meta.url);
/** Open one local database with the vec0 extension loaded. */
export function openDb(address) {
    const { getLoadablePath } = require('sqlite-vec');
    const db = new DatabaseSync(address, { allowExtension: true });
    db.loadExtension(getLoadablePath());
    return db;
}
/**
 * The embedding width the `v_chunks` virtual table was created with,
 * parsed back out of its stored DDL; undefined when the table is absent.
 */
function vectorDim(db) {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='v_chunks'").get();
    const match = row?.sql?.match(/embedding\s+float\[(\d+)\]/i);
    return match === null || match === undefined ? undefined : Number(match[1]);
}
/**
 * Create the database file and its schema when absent; a no-op when both
 * tables already exist (idempotent — every write path calls this first).
 * Existing databases created before `added_at` keep working for reads that
 * select the column only when present, so the schema upgrade below is a
 * plain ADD COLUMN guarded by a pragma check.
 */
export function ensureLocalDatabase(address, dim = 512) {
    if (!existsSync(address))
        mkdirSync(dirname(address), { recursive: true });
    const db = openDb(address);
    try {
        db.exec(`
      CREATE TABLE IF NOT EXISTS chunks(
        rowid INTEGER PRIMARY KEY,
        content TEXT NOT NULL,
        added_at TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT ''
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS v_chunks USING vec0(embedding float[${dim}]);
    `);
        // Healing passes for databases created by earlier prototypes: the
        // pre-added_at store and the knowledge-only schema (no kind/source yet).
        const columns = db.prepare('PRAGMA table_info(chunks)').all();
        if (columns.length > 0) {
            const names = new Set(columns.map(one => one.name));
            if (!names.has('added_at'))
                db.exec("ALTER TABLE chunks ADD COLUMN added_at TEXT NOT NULL DEFAULT ''");
            if (!names.has('kind'))
                db.exec("ALTER TABLE chunks ADD COLUMN kind TEXT NOT NULL DEFAULT ''");
            if (!names.has('source'))
                db.exec("ALTER TABLE chunks ADD COLUMN source TEXT NOT NULL DEFAULT ''");
        }
    }
    finally {
        db.close();
    }
}
/**
 * Insert a batch under one `added_at` timestamp (a batch is one logical
 * write). The vector width is checked against the table's — a mismatch
 * means the card's bound embedding model changed after creation, which the
 * caller surfaces instead of letting sqlite-vec fail obscurely.
 */
export function insertChunks(address, items, addedAt, meta = {}) {
    ensureLocalDatabase(address);
    const kind = meta.kind ?? '';
    const source = meta.source ?? '';
    const db = openDb(address);
    try {
        const dim = vectorDim(db) ?? 512;
        for (const item of items) {
            if (item.vector.length !== dim) {
                return { code: 'dim-mismatch', expected: dim, actual: item.vector.length };
            }
        }
        db.exec('BEGIN');
        try {
            const insertChunk = db.prepare('INSERT INTO chunks(content, added_at, kind, source) VALUES (?, ?, ?, ?)');
            const insertVector = db.prepare('INSERT INTO v_chunks(rowid, embedding) VALUES (?, ?)');
            for (const item of items) {
                const info = insertChunk.run(item.content, addedAt, kind, source);
                // vec0 rejects float-typed rowid binds: node:sqlite carries JS
                // numbers as float64, so the rowid must cross as BigInt.
                insertVector.run(BigInt(info.lastInsertRowid), Buffer.from(new Float32Array([...item.vector]).buffer));
            }
            db.exec('COMMIT');
        }
        catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
        return { added: items.length };
    }
    finally {
        db.close();
    }
}
/** The reporting cap on deleted contents — the count stays exact. */
const CONTENT_REPORT_CAP = 20;
/**
 * Delete by substring over `chunks` (newest first), removing the matching
 * vector rows too. `instr` over LIKE keeps the needle literal — no escaping
 * means the model's query text always matches as written.
 */
export function deleteByContent(address, needle) {
    ensureLocalDatabase(address);
    const db = openDb(address);
    try {
        const rows = db.prepare(`
      SELECT rowid AS id, content AS content FROM chunks
      WHERE instr(content, ?) > 0
      ORDER BY added_at DESC, rowid DESC
    `).all(needle);
        const deleteVector = db.prepare('DELETE FROM v_chunks WHERE rowid = ?');
        const deleteChunk = db.prepare('DELETE FROM chunks WHERE rowid = ?');
        db.exec('BEGIN');
        try {
            for (const row of rows) {
                deleteVector.run(BigInt(row.id));
                deleteChunk.run(row.id);
            }
            db.exec('COMMIT');
        }
        catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
        return { deleted: rows.length, contents: rows.slice(0, CONTENT_REPORT_CAP).map(row => row.content) };
    }
    finally {
        db.close();
    }
}
/** Clear every entry of one database (the `all` switch of knowledge_delete). */
export function clearChunks(address) {
    ensureLocalDatabase(address);
    const db = openDb(address);
    try {
        const rows = db.prepare('SELECT rowid AS id, content AS content FROM chunks').all();
        db.exec('BEGIN');
        try {
            db.exec('DELETE FROM v_chunks');
            db.exec('DELETE FROM chunks');
            db.exec('COMMIT');
        }
        catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
        return { deleted: rows.length, contents: rows.slice(0, CONTENT_REPORT_CAP).map(row => row.content) };
    }
    finally {
        db.close();
    }
}
/**
 * Every slice of one database in chronological order (added_at, then rowid —
 * a batch keeps its insertion order). This is the recall algorithm's input:
 * adjacency in this list is what "时间上下的相邻切片" means.
 */
export function listChunks(address) {
    ensureLocalDatabase(address);
    const db = openDb(address);
    try {
        return db.prepare(`
      SELECT rowid AS id, content AS content, added_at AS addedAt, kind AS kind, source AS source
      FROM chunks
      ORDER BY added_at ASC, rowid ASC
    `).all();
    }
    finally {
        db.close();
    }
}
/**
 * KNN search over one local database. The database is healed on demand, so
 * a missing file or an empty store is a legitimate empty result, not an
 * error. Relevance (distance) orders the hits; `added_at` rides along for
 * the model and breaks distance ties newest-first.
 */
export function queryLocal(address, vector, k) {
    ensureLocalDatabase(address);
    const db = openDb(address);
    try {
        const dim = vectorDim(db);
        if (dim !== undefined && vector.length !== dim) {
            throw new Error(`向量维度不匹配：库为 ${dim} 维，查询为 ${vector.length} 维（该卡片的 embedding 模型与建库模型不一致）`);
        }
        const present = db.prepare('SELECT count(*) AS n FROM chunks').get();
        if ((present?.n ?? 0) === 0)
            return [];
        return db.prepare(`
      SELECT c.rowid AS id, c.content AS content, v.distance AS distance, c.added_at AS addedAt
      FROM v_chunks v
      JOIN chunks c ON c.rowid = v.rowid
      WHERE v.embedding MATCH ? AND k = ?
      ORDER BY distance, c.added_at DESC
    `).all(Buffer.from(new Float32Array([...vector]).buffer), k);
    }
    finally {
        db.close();
    }
}
//# sourceMappingURL=query.js.map