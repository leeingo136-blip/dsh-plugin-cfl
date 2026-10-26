import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCardDb, openCardDb, ensureCardSchema } from '../packages/memory-api/lib/types/card-db.js'
import { applyAppraisal, decayedValue, decayAll, currentEmotionIntensity } from '../packages/memory-api/lib/types/emotion.js'

const dir = mkdtempSync(join(tmpdir(), 'memory-echo-test-'))
const dbPath = join(dir, 'test.sqlite')
createCardDb(dbPath)
const db = openCardDb(dbPath)
ensureCardSchema(db)

const adverse = {
  event: '他说今晚不回来了',
  relevance: 0.9,
  congruence: -0.8,
  agency: 'other',
  certainty: 0.8,
  coping: 0.2,
  norm: -0.3,
  novelty: 0.4,
  warmth: 0.2,
}

test('decay moves toward baseline, not zero', () => {
  const value = decayedValue('sadness', 0.9, new Date(Date.now() - 12 * 3600_000).toISOString(), null)
  assert.ok(value > 0.2 && value < 0.9, `expected between baseline and initial, got ${value}`)
})

test('adverse appraisal lowers valence, raises arousal, leaves lingering', () => {
  const before = db.prepare("SELECT value FROM self_state WHERE key='valence'").get().value
  applyAppraisal(db, adverse, null, { kind: 'test' })
  const after = db.prepare("SELECT value FROM self_state WHERE key='valence'").get().value
  assert.ok(after < before, 'valence should fall')
  const arousal = db.prepare("SELECT value FROM self_state WHERE key='arousal'").get().value
  assert.ok(arousal > 0, `arousal should rise above calm, got ${arousal}`)
  const lingering = db.prepare('SELECT label, intensity FROM lingering').all()
  assert.ok(lingering.length >= 1, 'adverse event should leave a lingering mood')
  assert.ok(currentEmotionIntensity(db) > 0.2)
})

test('change log records delta, cause and trigger message', () => {
  const row = db.prepare("SELECT param, before, delta, after, reason, message FROM emotion_change_log WHERE reason='appraisal' ORDER BY rowid DESC LIMIT 1").get()
  assert.ok(row !== undefined, 'expected a change log row')
  assert.ok(Math.abs(row.after - row.before - row.delta) < 1e-6)
  assert.equal(row.reason, 'appraisal')
  assert.ok(String(row.message).includes('今晚不回来'))
})

test('event row records cause and appraisal', () => {
  const row = db.prepare("SELECT emotion, cause_kind, appraisal FROM emotion_event ORDER BY rowid DESC LIMIT 1").get()
  assert.ok(['valence', 'arousal', 'dominance', 'attachment', 'trust'].includes(row.emotion))
  assert.equal(row.cause_kind, 'test')
  assert.ok(String(row.appraisal).includes('今晚不回来'))
})

test('relationship update moves solidarity/trust', () => {
  applyAppraisal(db, adverse, 'p1', { kind: 'test' })
  const trust = db.prepare("SELECT value FROM entity_state WHERE entity_id='p1' AND key='trust'").get()
  const solidarity = db.prepare("SELECT value FROM entity_state WHERE entity_id='p1' AND key='solidarity'").get()
  const attachment = db.prepare("SELECT value FROM entity_state WHERE entity_id='p1' AND key='attachment'").get()
  assert.ok(trust.value < 0.5, `trust should fall, got ${trust.value}`)
  assert.ok(solidarity.value < 0.5, `solidarity should fall, got ${solidarity.value}`)
  assert.ok(attachment.value < 0.5, `attachment should fall, got ${attachment.value}`)
})

test('decayAll keeps values within floor and ceiling', () => {
  decayAll(db)
  const rows = db.prepare('SELECT value, floor, ceiling FROM self_state').all()
  for (const row of rows) {
    assert.ok(row.value >= row.floor - 1e-9 && row.value <= row.ceiling + 1e-9)
  }
})

test('cleanup', () => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})
