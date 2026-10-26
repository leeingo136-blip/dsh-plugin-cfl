import test from 'node:test'
import assert from 'node:assert/strict'
import { computeSalience } from '../packages/memory-tools/dist/salience.js'

test('trivial message scores low', () => {
  const score = computeSalience({ text: '嗯', role: 'user' })
  assert.ok(score <= 0.5, `got ${score}`)
})

test('promise with emotion and signal scores high', () => {
  const score = computeSalience({ text: '我答应你，以后再也不会离开了，这是我的承诺', role: 'user' })
  assert.ok(score >= 0.6, `got ${score}`)
})

test('repeated content scores lower than novel content', () => {
  const recent = ['今天我们去了学校门口的拉面店，味道不错']
  const repeated = computeSalience({ text: '今天我们去了学校门口的拉面店，味道不错', role: 'user', recentTexts: recent })
  const fresh = computeSalience({ text: '我梦见自己在海上漂流，遇到了一只会说话的鲸鱼', role: 'user', recentTexts: recent })
  assert.ok(fresh > repeated, `fresh ${fresh} should beat repeated ${repeated}`)
})
