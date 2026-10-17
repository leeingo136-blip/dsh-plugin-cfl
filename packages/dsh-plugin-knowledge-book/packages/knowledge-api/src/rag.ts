/**
 * Local vector knowledge store over sqlite-vec.
 *
 * One SQLite file per knowledge base under the package's own `data/rag/`
 * directory (same self-contained posture as the local model weights). The
 * `vec0` virtual table carries the embedding column; the content lives in a
 * plain side table so full text stays inspectable with ordinary SQL. The
 * extension loads through Node's built-in `node:sqlite` — no native module
 * of our own, no server, no ABI rebuild beyond the extension binary that
 * the `sqlite-vec` npm package ships per-platform.
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

/** sqlite-vec resolves from this package's own dependency tree. */
const require = createRequire(import.meta.url)

/** The package's own data root, computed from the compiled module location. */
const DATA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/rag')

/** Embedding function the store binds at construction (keeps this module pure). */
export type Embed = (texts: readonly string[]) => Promise<number[][]>

interface DatabaseRecord {
  id: string
  name: string
  description: string
  /** The embedding model id (embedding-local's model identifier). */
  model: string
  dimension: number
  createdAt: string
}

interface Registry {
  databases: DatabaseRecord[]
}

function registryPath(): string {
  return join(DATA_ROOT, 'databases.json')
}

function readRegistry(): Registry {
  try {
    const raw = JSON.parse(readFileSync(registryPath(), 'utf8')) as Registry
    return { databases: Array.isArray(raw.databases) ? raw.databases : [] }
  } catch {
    return { databases: [] }
  }
}

function writeRegistry(registry: Registry): void {
  mkdirSync(DATA_ROOT, { recursive: true })
  writeFileSync(registryPath(), JSON.stringify(registry, null, 2))
}

function dbPath(id: string): string {
  return join(DATA_ROOT, `${id}.sqlite`)
}

/** Open one knowledge base with the vec0 extension loaded. */
function openDb(id: string): DatabaseSync {
  const { getLoadablePath } = require('sqlite-vec') as { getLoadablePath(): string }
  mkdirSync(DATA_ROOT, { recursive: true })
  const db = new DatabaseSync(dbPath(id), { allowExtension: true })
  db.loadExtension(getLoadablePath())
  return db
}

function tableFor(id: string): string {
  // Identifier-safe: ids are UUIDs we mint ourselves.
  return `v_${id.replaceAll('-', '_')}`
}

export interface RagStoreOptions {
  embed: Embed
}

/**
 * The knowledge store. Every operation opens the database lazily and closes
 * it after the statement batch — knowledge bases are queried far less often
 * than they are edited, and a short-lived connection sidesteps file-handle
 * lifetime questions entirely.
 */
export class RagStore {
  private readonly embed: Embed

  constructor(options: RagStoreOptions) {
    this.embed = options.embed
  }

  /** Every knowledge base with live row counts. */
  list(): Array<DatabaseRecord & { chunks: number }> {
    const registry = readRegistry()
    return registry.databases.map(record => {
      let chunks = 0
      if (existsSync(dbPath(record.id))) {
        const db = openDb(record.id)
        try {
          const row = db.prepare(`SELECT count(*) AS n FROM chunks_${tableFor(record.id)}`).get() as
            | { n: number }
            | undefined
          chunks = row?.n ?? 0
        } catch {
          chunks = 0
        } finally {
          db.close()
        }
      }
      return { ...record, chunks }
    })
  }

  /** Create one knowledge base; the dimension is learned from a probe embed. */
  async create(name: string, description: string, model: string | undefined): Promise<DatabaseRecord> {
    const [probe] = await this.embed(['维度探测'])
    const dimension = probe?.length ?? 0
    if (dimension === 0) throw new Error('向量维度探测失败：嵌入服务不可用或模型未加载')
    const record: DatabaseRecord = {
      id: randomUUID(),
      name,
      description,
      model: model ?? '',
      dimension,
      createdAt: new Date().toISOString(),
    }
    const table = tableFor(record.id)
    const db = openDb(record.id)
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ${table} USING vec0(embedding float[${dimension}]);
        CREATE TABLE IF NOT EXISTS chunks_${table} (
          rowid INTEGER PRIMARY KEY,
          content TEXT NOT NULL
        );
      `)
    } finally {
      db.close()
    }
    const registry = readRegistry()
    registry.databases.push(record)
    writeRegistry(registry)
    return record
  }

  /** Delete one knowledge base: registry row + database file. */
  delete(id: string): void {
    const registry = readRegistry()
    registry.databases = registry.databases.filter(one => one.id !== id)
    writeRegistry(registry)
    if (existsSync(dbPath(id))) rmSync(dbPath(id), { force: true })
  }

  /** Embed and insert a batch of chunks; returns how many rows landed. */
  async ingest(id: string, texts: readonly string[]): Promise<number> {
    const record = readRegistry().databases.find(one => one.id === id)
    if (record === undefined) throw new Error(`知识库不存在（${id}）`)
    const vectors = await this.embed(texts)
    const table = tableFor(id)
    const db = openDb(id)
    try {
      const insertVec = db.prepare(`INSERT INTO ${table}(rowid, embedding) VALUES (?, ?)`)
      const insertChunk = db.prepare(`INSERT INTO chunks_${table}(content) VALUES (?)`)
      for (let index = 0; index < texts.length; index += 1) {
        const text = texts[index]
          ?? ''
        const vector = vectors[index]
        if (vector === undefined) continue
        insertChunk.run(text)
        const rowid = db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number | bigint }
        insertVec.run(BigInt(rowid.id), Buffer.from(new Float32Array(vector).buffer))
      }
    } finally {
      db.close()
    }
    return vectors.length
  }

  /** KNN search: embed the query, return the nearest chunks with distances. */
  async query(id: string, text: string, k: number): Promise<Array<{ content: string; distance: number }>> {
    const record = readRegistry().databases.find(one => one.id === id)
    if (record === undefined) throw new Error(`知识库不存在（${id}）`)
    const [vector] = await this.embed([text])
    if (vector === undefined) throw new Error('查询向量生成失败')
    if (vector.length !== record.dimension) {
      throw new Error(`向量维度不匹配：库为 ${record.dimension} 维，当前模型输出 ${vector.length} 维`)
    }
    const table = tableFor(id)
    const db = openDb(id)
    try {
      const rows = db.prepare(`
        SELECT c.content AS content, v.distance AS distance
        FROM ${table} v
        JOIN chunks_${table} c ON c.rowid = v.rowid
        WHERE v.embedding MATCH ? AND k = ?
        ORDER BY distance
      `).all(Buffer.from(new Float32Array(vector).buffer), k) as Array<{ content: string; distance: number }>
      return rows
    } finally {
      db.close()
    }
  }
}

/** Dev sanity helper: the data root this store writes into. */
export function dataRoot(): string {
  if (!existsSync(DATA_ROOT)) mkdirSync(DATA_ROOT, { recursive: true })
  return DATA_ROOT
}

/** Directory listing of one knowledge base's stored chunk count, without a DB open. */
export function storedDatabaseIds(): string[] {
  try {
    return readdirSync(DATA_ROOT).filter(one => one.endsWith('.sqlite')).map(one => one.slice(0, -'.sqlite'.length))
  } catch {
    return []
  }
}
