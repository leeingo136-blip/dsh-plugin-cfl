/** 把旧的向量 chunks 回填为结构化 memories，供开场前情与回忆使用。 */
import { randomUUID } from 'node:crypto'
import { ensureCardSchema, openCardDb } from './card-db.ts'

/** 旧版本曾把 reasoning 写进 memories：清理掉，避免出现在开场前情里。 */
export function cleanupReasoningMemories(address: string): number {
  const db = openCardDb(address)
  try {
    ensureCardSchema(db)
    const outcome = db.prepare(`DELETE FROM memories
      WHERE source LIKE '%reasoning%'
         OR content LIKE '%<user:memory-context>%'
         OR content LIKE '%<user:dream>%'`).run()
    return Number(outcome.changes ?? 0)
  } catch {
    return 0
  } finally {
    db.close()
  }
}

export function backfillMemories(address: string): number {
  const db = openCardDb(address)
  try {
    ensureCardSchema(db)
    let rows: Array<{ content: string, added_at: string, kind: string, source: string }> = []
    try {
      rows = db.prepare('SELECT content, added_at, kind, source FROM chunks').all() as typeof rows
    } catch {
      return 0
    }
    const existing = new Set((db.prepare('SELECT content FROM memories').all() as Array<{ content: string }>).map(row => row.content))
    const insert = db.prepare(`INSERT INTO memories(id, kind, user_name, content, created_at, salience, source)
                               VALUES (?, ?, ?, ?, ?, 0.5, 'backfill')`)
    let added = 0
    for (const row of rows) {
      if (row.kind === 'dream') continue
      const content = row.content.trim()
      if (content.length < 8 || existing.has(content)) continue
      const kind = /·\s*user$/u.test(row.source) ? 'user' : 'assistant'
      insert.run(randomUUID(), kind, kind === 'user' ? 'user' : null, content, row.added_at || new Date().toISOString())
      existing.add(content)
      added += 1
    }
    return added
  } catch {
    return 0
  } finally {
    db.close()
  }
}
