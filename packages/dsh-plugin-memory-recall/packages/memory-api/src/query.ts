/**
 * Vector search against one local RAG database file.
 *
 * The on-disk schema is the contract between the future knowledge tools
 * (ingest) and this query path: a `chunks` side table keeps the plain text
 * (inspectable with ordinary SQL) and the `v_chunks` vec0 virtual table
 * carries the embedding column, joined by rowid. Connections are short-lived
 * — open, one statement batch, close — mirroring the old library store.
 * `node:sqlite` + the `sqlite-vec` npm extension binary; no native module of
 * our own.
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

/** sqlite-vec resolves from this package's own dependency tree. */
const require = createRequire(import.meta.url)

export interface QueryHit {
  content: string
  distance: number
}

/** Human-readable reasons a local query can fail before/outside SQL. */
export type QueryFault =
  | { code: 'db-missing'; address: string }
  | { code: 'db-empty'; address: string }

/** Open one local database with the vec0 extension loaded. */
function openDb(address: string): DatabaseSync {
  const { getLoadablePath } = require('sqlite-vec') as { getLoadablePath(): string }
  const db = new DatabaseSync(address, { allowExtension: true })
  db.loadExtension(getLoadablePath())
  return db
}

/**
 * KNN search over one local database. The embedding column dimension is
 * whatever the database was created with — a mismatch against the query
 * vector surfaces as a sqlite-vec error the caller maps onto a message.
 */
export function queryLocal(address: string, vector: readonly number[], k: number): QueryFault | QueryHit[] {
  if (!existsSync(address)) return { code: 'db-missing', address }
  const db = openDb(address)
  try {
    const present = db.prepare(
      "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('v_chunks','chunks')",
    ).get() as { n: number }
    if ((present?.n ?? 0) < 2) return { code: 'db-empty', address }
    return db.prepare(`
      SELECT c.content AS content, v.distance AS distance
      FROM v_chunks v
      JOIN chunks c ON c.rowid = v.rowid
      WHERE v.embedding MATCH ? AND k = ?
      ORDER BY distance
    `).all(Buffer.from(new Float32Array([...vector]).buffer), k) as unknown as QueryHit[]
  } finally {
    db.close()
  }
}
