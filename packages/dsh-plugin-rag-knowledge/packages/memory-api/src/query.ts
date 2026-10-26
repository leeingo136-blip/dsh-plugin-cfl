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
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

/** sqlite-vec resolves from this package's own dependency tree. */
const require = createRequire(import.meta.url)

/** A type literal (not an interface) so it stays JSON-wire-assignable. */
export type SearchHit = {
  docId: string
  title: string
  snippet: string
  content: string
  distance: number
  updatedAt: string
  tags: string
}

/** One stored knowledge document. */
export type DocumentRecord = {
  id: string
  title: string
  summary: string
  tags: string
  source: string
  status: string
  revision: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** A document plus its body (returned by `getDocument`). */
export type DocumentDetail = DocumentRecord & { content: string }

/** Why one write can refuse before/inside SQL. */
export type WriteFault =
  | { code: 'dim-mismatch'; expected: number; actual: number }
  | { code: 'no-vector' }

/** Input for `createDocument`. */
export interface CreateDocumentInput {
  title: string
  summary?: string
  tags?: string
  source?: string
  content: string
  vector: readonly number[]
  embeddingModel?: string
}

/** Input for `updateDocument`; `revision` is the caller's expected value. */
export interface UpdateDocumentInput {
  id: string
  revision: number
  title?: string
  summary?: string
  tags?: string
  content?: string
  vector?: readonly number[]
  embeddingModel?: string
}

/** Update outcome; `stale` means the caller's revision no longer matches. */
export type UpdateOutcome =
  | { ok: true; revision: number }
  | { ok: false; reason: 'not-found' | 'stale' | 'dim-mismatch'; expected?: number; actual?: number }

/** Open one local database with the vec0 extension loaded. */
export function openDb(address: string): DatabaseSync {
  const { getLoadablePath } = require('sqlite-vec') as { getLoadablePath(): string }
  const db = new DatabaseSync(address, { allowExtension: true })
  db.loadExtension(getLoadablePath())
  return db
}

/** SHA-256 of a normalized body, used for duplicate detection. */
export function hashContent(content: string): string {
  return createHash('sha256').update(content.replace(/\s+/gu, ' ').trim()).digest('hex')
}

/**
 * The embedding width the `v_chunks` virtual table was created with,
 * parsed back out of its stored DDL; undefined when the table is absent.
 */
export function vectorDim(db: DatabaseSync): number | undefined {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='v_chunks'",
  ).get() as { sql?: string | null } | undefined
  const match = row?.sql?.match(/embedding\s+float\[(\d+)\]/i)
  return match === null || match === undefined ? undefined : Number(match[1])
}

/**
 * Create the file and its schema when absent; idempotent.
 *
 * A file created by an older prototype (legacy `chunks.rowid/added_at` layout,
 * no `documents`) is not migrated: this store is new, and mixing the two
 * schemas silently would corrupt ranking. The caller is told to rebuild via
 * the card editor instead.
 */
export function ensureLocalDatabase(address: string, dim = 512): void {
  if (!existsSync(address)) mkdirSync(dirname(address), { recursive: true })
  const db = openDb(address)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents(
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        revision INTEGER NOT NULL DEFAULT 1,
        content_hash TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE TABLE IF NOT EXISTS chunks(
        rowid INTEGER PRIMARY KEY,
        doc_id TEXT NOT NULL,
        seq INTEGER NOT NULL DEFAULT 0,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL DEFAULT '',
        embedding_model TEXT NOT NULL DEFAULT '',
        embedding_dim INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chunks_doc ON chunks(doc_id);
      CREATE VIRTUAL TABLE IF NOT EXISTS v_chunks USING vec0(embedding float[${dim}]);
    `)
  } finally {
    db.close()
  }
}

/** Whether the file carries the current schema (documents + chunks.doc_id). */
export function hasCurrentSchema(address: string): boolean {
  if (!existsSync(address)) return false
  const db = openDb(address)
  try {
    const docs = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'").get()
    return docs !== undefined
  } finally {
    db.close()
  }
}

/** One chunk row joined with its document, for search results. */
type SearchRow = {
  doc_id: string
  title: string
  content: string
  tags: string
  updated_at: string
  distance: number
}

function asDocument(row: Record<string, unknown>): DocumentRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    summary: String(row.summary ?? ''),
    tags: String(row.tags ?? '[]'),
    source: String(row.source ?? ''),
    status: String(row.status ?? 'active'),
    revision: Number(row.revision ?? 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at === null || row.deleted_at === undefined ? null : String(row.deleted_at),
  }
}

function dimFault(db: DatabaseSync, vector: readonly number[]): WriteFault | undefined {
  const expected = vectorDim(db) ?? 512
  return vector.length === expected ? undefined : { code: 'dim-mismatch', expected, actual: vector.length }
}

/** Insert one document with its single chunk and vector. */
export function createDocument(address: string, input: CreateDocumentInput): WriteFault | { id: string, revision: number } {
  // First write decides the vector width; later writes are checked against it.
  ensureLocalDatabase(address, input.vector.length)
  const db = openDb(address)
  try {
    const fault = dimFault(db, input.vector)
    if (fault !== undefined) return fault
    const id = randomUUID()
    const now = new Date().toISOString()
    const hash = hashContent(input.content)
    db.exec('BEGIN')
    try {
      db.prepare(`INSERT INTO documents(id, title, summary, tags, source, status, revision, content_hash, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, 'active', 1, ?, ?, ?)`)
        .run(id, input.title, input.summary ?? '', input.tags ?? '[]', input.source ?? '', hash, now, now)
      const info = db.prepare(`INSERT INTO chunks(doc_id, seq, content, content_hash, embedding_model, embedding_dim, created_at, updated_at)
                                VALUES (?, 0, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.content, hash, input.embeddingModel ?? '', input.vector.length, now, now)
      db.prepare('INSERT INTO v_chunks(rowid, embedding) VALUES (?, ?)')
        .run(BigInt(info.lastInsertRowid), Buffer.from(new Float32Array([...input.vector]).buffer))
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { id, revision: 1 }
  } finally {
    db.close()
  }
}

/** Read one document (including its body); soft-deleted rows are hidden. */
export function getDocument(address: string, id: string): DocumentDetail | undefined {
  ensureLocalDatabase(address)
  const db = openDb(address)
  try {
    const row = db.prepare(`SELECT d.*, c.content AS body FROM documents d
                            LEFT JOIN chunks c ON c.doc_id = d.id AND c.seq = 0
                            WHERE d.id = ? AND d.status != 'deleted'`).get(id) as Record<string, unknown> | undefined
    if (row === undefined) return undefined
    return { ...asDocument(row), content: String(row.body ?? '') }
  } finally {
    db.close()
  }
}

/** List documents, newest update first. */
export function listDocuments(address: string, options: { limit?: number, offset?: number, status?: string, tag?: string } = {}): DocumentRecord[] {
  ensureLocalDatabase(address)
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100))
  const offset = Math.max(0, options.offset ?? 0)
  const status = options.status ?? 'active'
  const db = openDb(address)
  try {
    const rows = db.prepare(`SELECT * FROM documents
                             WHERE status = ? AND (? = '' OR tags LIKE ?)
                             ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
      .all(status, options.tag ?? '', options.tag === undefined ? '' : `%${options.tag}%`, limit, offset) as Array<Record<string, unknown>>
    return rows.map(asDocument)
  } finally {
    db.close()
  }
}

/** Replace the body + vector of one document under optimistic concurrency. */
export function updateDocument(address: string, input: UpdateDocumentInput): UpdateOutcome {
  ensureLocalDatabase(address)
  const db = openDb(address)
  try {
    const current = db.prepare('SELECT revision, status FROM documents WHERE id = ?').get(input.id) as { revision: number, status: string } | undefined
    if (current === undefined || current.status === 'deleted') return { ok: false, reason: 'not-found' }
    if (Number(current.revision) !== input.revision) return { ok: false, reason: 'stale' }

    if (input.content !== undefined && input.vector !== undefined) {
      const fault = dimFault(db, input.vector)
      if (fault !== undefined && fault.code === 'dim-mismatch') {
        return { ok: false, reason: 'dim-mismatch', expected: fault.expected, actual: fault.actual }
      }
    }

    const now = new Date().toISOString()
    const next = input.revision + 1
    db.exec('BEGIN')
    try {
      if (input.title !== undefined || input.summary !== undefined || input.tags !== undefined || input.content !== undefined) {
        const hash = input.content === undefined ? undefined : hashContent(input.content)
        db.prepare(`UPDATE documents SET
                      title = COALESCE(?, title),
                      summary = COALESCE(?, summary),
                      tags = COALESCE(?, tags),
                      content_hash = COALESCE(?, content_hash),
                      revision = ?, updated_at = ?
                    WHERE id = ?`)
          .run(input.title ?? null, input.summary ?? null, input.tags ?? null, hash ?? null, next, now, input.id)
      } else {
        db.prepare('UPDATE documents SET revision = ?, updated_at = ? WHERE id = ?').run(next, now, input.id)
      }

      if (input.content !== undefined && input.vector !== undefined) {
        const hash = hashContent(input.content)
        const old = db.prepare('SELECT rowid FROM chunks WHERE doc_id = ?').all(input.id) as Array<{ rowid: number }>
        for (const row of old) db.prepare('DELETE FROM v_chunks WHERE rowid = ?').run(BigInt(row.rowid))
        db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(input.id)
        const info = db.prepare(`INSERT INTO chunks(doc_id, seq, content, content_hash, embedding_model, embedding_dim, created_at, updated_at)
                                  VALUES (?, 0, ?, ?, ?, ?, ?, ?)`)
          .run(input.id, input.content, hash, input.embeddingModel ?? '', input.vector.length, now, now)
        db.prepare('INSERT INTO v_chunks(rowid, embedding) VALUES (?, ?)')
          .run(BigInt(info.lastInsertRowid), Buffer.from(new Float32Array([...input.vector]).buffer))
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { ok: true, revision: next }
  } finally {
    db.close()
  }
}

/** Soft-delete by default (status + deleted_at), or remove rows entirely. */
export function deleteDocuments(address: string, ids: readonly string[], mode: 'soft' | 'hard' = 'soft'): { deleted: number } {
  ensureLocalDatabase(address)
  const db = openDb(address)
  try {
    let deleted = 0
    const now = new Date().toISOString()
    db.exec('BEGIN')
    try {
      for (const id of ids) {
        if (mode === 'soft') {
          const info = db.prepare("UPDATE documents SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ? AND status != 'deleted'").run(now, now, id)
          deleted += Number(info.changes)
          continue
        }
        const rows = db.prepare('SELECT rowid FROM chunks WHERE doc_id = ?').all(id) as Array<{ rowid: number }>
        for (const row of rows) db.prepare('DELETE FROM v_chunks WHERE rowid = ?').run(BigInt(row.rowid))
        db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(id)
        const info = db.prepare('DELETE FROM documents WHERE id = ?').run(id)
        deleted += Number(info.changes)
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { deleted }
  } finally {
    db.close()
  }
}

/** Vector nearest-neighbour search over active documents. */
export function searchByVector(address: string, vector: readonly number[], k = 5): SearchHit[] {
  ensureLocalDatabase(address)
  const db = openDb(address)
  try {
    // sqlite-vec KNN: `MATCH` + `k` select the nearest rowids; the joins then
    // filter soft-deleted documents and enrich the hits.
    const rows = db.prepare(`
      SELECT c.doc_id, d.title, c.content, d.tags, d.updated_at, knn.distance
      FROM (SELECT rowid, distance FROM v_chunks WHERE embedding MATCH ? AND k = ? ORDER BY distance) AS knn
      JOIN chunks c ON c.rowid = knn.rowid
      JOIN documents d ON d.id = c.doc_id AND d.status = 'active'
      ORDER BY knn.distance
    `).all(Buffer.from(new Float32Array([...vector]).buffer), Math.max(1, Math.min(k, 50))) as unknown as SearchRow[]
    return rows.map(row => ({
      docId: String(row.doc_id),
      title: String(row.title),
      content: String(row.content),
      snippet: String(row.content).slice(0, 200),
      distance: Number(row.distance),
      updatedAt: String(row.updated_at),
      tags: String(row.tags ?? '[]'),
    }))
  } finally {
    db.close()
  }
}

/** One document matched by a keyword filter (for the card modal). */
export type DocumentHit = { id: string, title: string, snippet: string, updatedAt: string, status: string }

/** Keyword filter over title + content; an empty query returns nothing on purpose. */
export function filterDocuments(address: string, query: string, limit = 20): DocumentHit[] {
  const needle = query.trim()
  if (needle === '') return []
  ensureLocalDatabase(address)
  const esc = needle.replace(/[\\%_]/gu, match => `\\${match}`)
  const like = `%${esc}%`
  const db = openDb(address)
  try {
    const rows = db.prepare(`
      SELECT d.id, d.title, d.status, d.updated_at, c.content
      FROM documents d
      LEFT JOIN chunks c ON c.doc_id = d.id AND c.seq = 0
      WHERE d.status = 'active'
        AND (d.title LIKE ? ESCAPE '\\' OR c.content LIKE ? ESCAPE '\\')
      ORDER BY d.updated_at DESC
      LIMIT ?
    `).all(like, like, Math.max(1, Math.min(limit, 100))) as Array<{
      id: string, title: string, status: string, updated_at: string, content: string | null
    }>
    return rows.map(row => ({
      id: String(row.id),
      title: String(row.title),
      snippet: String(row.content ?? '').slice(0, 200),
      updatedAt: String(row.updated_at),
      status: String(row.status),
    }))
  } finally {
    db.close()
  }
}

/** Total active (or chosen status) document count, for pagination hints. */
export function countDocuments(address: string, status = 'active'): number {
  ensureLocalDatabase(address)
  const db = openDb(address)
  try {
    const row = db.prepare('SELECT count(*) AS n FROM documents WHERE status = ?').get(status) as { n: number }
    return Number(row.n)
  } finally {
    db.close()
  }
}
