/**
 * The local RAG vector store: one sqlite file per card, sqlite-vec for the
 * embedding column, ordinary SQL for everything else.
 *
 * Schema (created on demand by {@link ensureLocalDatabase}):
 *
 * - `documents` — one knowledge entry: stable id, title, summary, tags,
 *   source, status, revision (optimistic concurrency), content hash, and the
 *   created/updated timestamps.
 * - `chunks` — the searchable slice of a document (one chunk per document
 *   today; `seq` leaves room for splitting later), joined to the document by
 *   `doc_id`.
 * - `v_chunks` — the vec0 virtual table, joined to `chunks.rowid`.
 *
 * Every entry point heals a missing file/schema first, and connections are
 * short-lived: open, one statement batch, close.
 */
import { DatabaseSync } from 'node:sqlite';
/** A type literal (not an interface) so it stays JSON-wire-assignable. */
export type SearchHit = {
    docId: string;
    title: string;
    snippet: string;
    content: string;
    distance: number;
    updatedAt: string;
    tags: string;
};
/** One stored knowledge document. */
export type DocumentRecord = {
    id: string;
    title: string;
    summary: string;
    tags: string;
    source: string;
    status: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};
/** A document plus its body (returned by `getDocument`). */
export type DocumentDetail = DocumentRecord & {
    content: string;
};
/** Why one write can refuse before/inside SQL. */
export type WriteFault = {
    code: 'dim-mismatch';
    expected: number;
    actual: number;
} | {
    code: 'no-vector';
};
/** Input for `createDocument`. */
export interface CreateDocumentInput {
    title: string;
    summary?: string;
    tags?: string;
    source?: string;
    content: string;
    vector: readonly number[];
    embeddingModel?: string;
}
/** Input for `updateDocument`; `revision` is the caller's expected value. */
export interface UpdateDocumentInput {
    id: string;
    revision: number;
    title?: string;
    summary?: string;
    tags?: string;
    content?: string;
    vector?: readonly number[];
    embeddingModel?: string;
}
/** Update outcome; `stale` means the caller's revision no longer matches. */
export type UpdateOutcome = {
    ok: true;
    revision: number;
} | {
    ok: false;
    reason: 'not-found' | 'stale' | 'dim-mismatch';
    expected?: number;
    actual?: number;
};
/** Open one local database with the vec0 extension loaded. */
export declare function openDb(address: string): DatabaseSync;
/** SHA-256 of a normalized body, used for duplicate detection. */
export declare function hashContent(content: string): string;
/**
 * The embedding width the `v_chunks` virtual table was created with,
 * parsed back out of its stored DDL; undefined when the table is absent.
 */
export declare function vectorDim(db: DatabaseSync): number | undefined;
/**
 * Create the file and its schema when absent; idempotent.
 *
 * A file created by an older prototype (legacy `chunks.rowid/added_at` layout,
 * no `documents`) is not migrated: this store is new, and mixing the two
 * schemas silently would corrupt ranking. The caller is told to rebuild via
 * the card editor instead.
 */
export declare function ensureLocalDatabase(address: string, dim?: number): void;
/** Whether the file carries the current schema (documents + chunks.doc_id). */
export declare function hasCurrentSchema(address: string): boolean;
/** Insert one document with its single chunk and vector. */
export declare function createDocument(address: string, input: CreateDocumentInput): WriteFault | {
    id: string;
    revision: number;
};
/** Read one document (including its body); soft-deleted rows are hidden. */
export declare function getDocument(address: string, id: string): DocumentDetail | undefined;
/** List documents, newest update first. */
export declare function listDocuments(address: string, options?: {
    limit?: number;
    offset?: number;
    status?: string;
    tag?: string;
}): DocumentRecord[];
/** Replace the body + vector of one document under optimistic concurrency. */
export declare function updateDocument(address: string, input: UpdateDocumentInput): UpdateOutcome;
/** Soft-delete by default (status + deleted_at), or remove rows entirely. */
export declare function deleteDocuments(address: string, ids: readonly string[], mode?: 'soft' | 'hard'): {
    deleted: number;
};
/** Vector nearest-neighbour search over active documents. */
export declare function searchByVector(address: string, vector: readonly number[], k?: number): SearchHit[];
/** One document matched by a keyword filter (for the card modal). */
export type DocumentHit = {
    id: string;
    title: string;
    snippet: string;
    updatedAt: string;
    status: string;
};
/** Keyword filter over title + content; an empty query returns nothing on purpose. */
export declare function filterDocuments(address: string, query: string, limit?: number): DocumentHit[];
/** Total active (or chosen status) document count, for pagination hints. */
export declare function countDocuments(address: string, status?: string): number;
//# sourceMappingURL=query.d.ts.map