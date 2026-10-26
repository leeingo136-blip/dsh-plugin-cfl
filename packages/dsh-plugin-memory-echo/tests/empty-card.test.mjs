import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCardDb, openCardDb, ensureCardSchema, writeCard, readCard } from '../packages/memory-api/lib/types/card-db.js'
import { applyAppraisal, decayAll } from '../packages/memory-api/lib/types/emotion.js'
import { dedupeMemories, dedupeDreams } from '../packages/memory-api/lib/types/consolidate.js'
import { backfillMemories } from '../packages/memory-api/lib/types/backfill.js'
import { listDreams, queryLocal } from '../packages/memory-api/lib/types/query.js'

const dir = mkdtempSync(join(tmpdir(), 'memory-echo-empty-'))
const dbPath = join(dir, 'empty.sqlite')

test('minimal card: only name and persona', () => {
  createCardDb(dbPath)
  writeCard(dbPath, { name: '小明', persona: '一个安静的角色' })
  const card = readCard(dbPath)
  assert.equal(card.name, '小明')
  assert.equal(card.persona, '一个安静的角色')

  const db = openCardDb(dbPath)
  ensureCardSchema(db)
  const state = db.prepare('SELECT count(*) AS n FROM self_state').get()
  assert.equal(state.n, 5, `expected 5 affect/sentiment rows, got ${state.n}`)
  const memories = db.prepare('SELECT count(*) AS n FROM memories').get()
  assert.equal(memories.n, 0)
  for (const table of ['entities', 'sleep_state', 'emotion_event', 'session_state']) {
    const row = db.prepare(`SELECT count(*) AS n FROM ${table}`).get()
    assert.equal(row.n, 0, `${table} should start empty`)
  }
  db.close()
})

test('empty-card operations do not throw', () => {
  assert.equal(backfillMemories(dbPath), 0)
  assert.equal(dedupeMemories(dbPath), 0)
  assert.equal(dedupeDreams(dbPath), 0)
  assert.deepEqual(listDreams(dbPath), [])
  assert.deepEqual(queryLocal(dbPath, new Array(512).fill(0), 5), [])
})

test('emotion works on an empty card', () => {
  const db = openCardDb(dbPath)
  ensureCardSchema(db)
  decayAll(db)
  const out = applyAppraisal(db, {
    event: '测试事件', relevance: 0.8, congruence: 0.6, agency: 'other',
    certainty: 0.7, coping: 0.6, norm: 0.4, novelty: 0.3, warmth: 0.7,
  }, null, { kind: 'test' })
  assert.ok(out.affect.length + out.relation.length > 0)
  const pad = db.prepare("SELECT value FROM self_state WHERE key='valence'").get()
  assert.ok(pad.value > 0, 'positive appraisal should raise valence')
  const events = db.prepare('SELECT count(*) AS n FROM emotion_event').get()
  assert.ok(events.n >= 1)
  db.close()
})

test('cleanup', () => {
  rmSync(dir, { recursive: true, force: true })
})
