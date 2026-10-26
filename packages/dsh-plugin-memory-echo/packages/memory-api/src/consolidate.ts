/** 记忆去重合并：同一句话反复写入时合并为一条，并小幅提升震撼值。 */
import { ensureCardSchema, openCardDb } from './card-db.ts'
import { openDb } from './query.ts'

function normalize(text: string): string {
  return text.replace(/\s+/gu, '').replace(/[\p{P}]/gu, '')
}

function bigrams(text: string): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i < text.length - 1; i += 1) set.add(text.slice(i, i + 2))
  return set
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const gram of a) if (b.has(gram)) shared += 1
  return shared / (a.size + b.size - shared)
}

/** 精确重复 + 高相似（>0.92）合并，返回删除条数。 */
export function dedupeMemories(address: string): number {
  const db = openCardDb(address)
  try {
    ensureCardSchema(db)
    const rows = db.prepare('SELECT id, content, salience, created_at FROM memories ORDER BY created_at').all() as Array<{
      id: string, content: string, salience: number, created_at: string,
    }>
    const kept: Array<{ id: string, norm: string, grams: Set<string>, salience: number }> = []
    const remove: Array<{ id: string, keep: string }> = []
    for (const row of rows) {
      const norm = normalize(row.content)
      if (norm.length < 8) { kept.push({ id: row.id, norm, grams: bigrams(norm), salience: row.salience }); continue }
      const grams = bigrams(norm)
      const match = kept.find(item => item.norm === norm || (item.norm.length > 20 && similarity(item.grams, grams) > 0.92))
      if (match === undefined) {
        kept.push({ id: row.id, norm, grams, salience: row.salience })
      } else {
        remove.push({ id: row.id, keep: match.id })
        match.salience = Math.max(match.salience, row.salience)
      }
    }
    for (const item of remove) db.prepare('DELETE FROM memories WHERE id = ?').run(item.id)
    if (remove.length > 0) {
      const update = db.prepare('UPDATE memories SET salience = MIN(0.98, ? + 0.03) WHERE id = ?')
      for (const item of kept) update.run(item.salience, item.id)
    }
    return remove.length
  } finally {
    db.close()
  }
}


/** 梦境去重：相似的梦只保留最新一条（dream 存在 chunks 里，不在 memories）。 */
export function dedupeDreams(address: string): number {
  const db = openDb(address)
  try {
    let rows: Array<{ rowid: number, content: string }> = []
    try {
      rows = db.prepare("SELECT rowid, content FROM chunks WHERE kind = 'dream' ORDER BY added_at DESC, rowid DESC").all() as typeof rows
    } catch {
      return 0
    }
    const kept: Array<{ rowid: number, norm: string, grams: Set<string> }> = []
    const remove: number[] = []
    for (const row of rows) {
      const norm = normalize(row.content)
      const grams = bigrams(norm)
      const match = kept.find(item => item.norm === norm || (item.norm.length > 20 && similarity(item.grams, grams) > 0.9))
      if (match === undefined) kept.push({ rowid: row.rowid, norm, grams })
      else remove.push(row.rowid)
    }
    if (remove.length > 0) {
      const delVector = db.prepare('DELETE FROM v_chunks WHERE rowid = ?')
      const delChunk = db.prepare('DELETE FROM chunks WHERE rowid = ?')
      db.exec('BEGIN')
      try {
        for (const id of remove) { delVector.run(BigInt(id)); delChunk.run(id) }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }
    return remove.length
  } catch {
    return 0
  } finally {
    db.close()
  }
}
