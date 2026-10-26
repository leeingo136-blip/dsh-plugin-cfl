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
/** A type literal (not an interface) so it stays JSON-wire-assignable. */
export type QueryHit = {
    id: number;
    content: string;
    distance: number;
    addedAt: string;
};
/** One memory slice in chronological order (the recall algorithm's row shape). */
export interface RecallRow {
    id: number;
    content: string;
    addedAt: string;
    kind: string;
    source: string;
}
/** Batch-level metadata stored alongside every slice of one insert. */
export interface ChunkMeta {
    kind?: string;
    source?: string;
}
/** Open one local database with the vec0 extension loaded. */
export declare function openDb(address: string): DatabaseSync;
/**
 * Create the database file and its schema when absent; a no-op when both
 * tables already exist (idempotent — every write path calls this first).
 * Existing databases created before `added_at` keep working for reads that
 * select the column only when present, so the schema upgrade below is a
 * plain ADD COLUMN guarded by a pragma check.
 */
export declare function ensureLocalDatabase(address: string, dim?: number): void;
/** Why one write can refuse before/inside SQL. */
export type WriteFault = {
    code: 'dim-mismatch';
    expected: number;
    actual: number;
} | {
    code: 'no-vector';
    index: number;
};
/** One entry to persist: plain text plus its embedding. */
export interface ChunkInput {
    content: string;
    vector: readonly number[];
}
/**
 * Insert a batch under one `added_at` timestamp (a batch is one logical
 * write). The vector width is checked against the table's — a mismatch
 * means the card's bound embedding model changed after creation, which the
 * caller surfaces instead of letting sqlite-vec fail obscurely.
 */
export declare function insertChunks(address: string, items: readonly ChunkInput[], addedAt: string, meta?: ChunkMeta): WriteFault | {
    added: number;
};
/** One stored dream entry, newest first. */
export interface DreamEntry {
    rowid: number;
    content: string;
    addedAt: string;
    source: string;
}
/**
 * Read the most recent dreams of one card.
 *
 * Dreams are ordinary chunks with `kind = 'dream'`, so they live in the same
 * store as everything else — this is only a filtered read for callers that want
 * "what did I dream" without a semantic query.
 */
export declare function listDreams(address: string, limit?: number): DreamEntry[];
/** What one delete removed (contents capped for reporting sanity). */
export interface DeleteOutcome {
    deleted: number;
    contents: string[];
}
/**
 * Delete by substring over `chunks` (newest first), removing the matching
 * vector rows too. `instr` over LIKE keeps the needle literal — no escaping
 * means the model's query text always matches as written.
 */
export declare function deleteByContent(address: string, needle: string): DeleteOutcome;
/** Clear every entry of one database (the `all` switch of knowledge_delete). */
export declare function clearChunks(address: string): DeleteOutcome;
/**
 * Every slice of one database in chronological order (added_at, then rowid —
 * a batch keeps its insertion order). This is the recall algorithm's input:
 * adjacency in this list is what "时间上下的相邻切片" means.
 */
export declare function listChunks(address: string): RecallRow[];
/**
 * KNN search over one local database. The database is healed on demand, so
 * a missing file or an empty store is a legitimate empty result, not an
 * error. Relevance (distance) orders the hits; `added_at` rides along for
 * the model and breaks distance ties newest-first.
 */
export declare function queryLocal(address: string, vector: readonly number[], k: number): QueryHit[];
//# sourceMappingURL=query.d.ts.map