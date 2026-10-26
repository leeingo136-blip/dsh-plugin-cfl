#!/usr/bin/env node
// 把一个旧会话的 user/assistant 消息导入为角色模板。
// 用法: node scripts/import-session.mjs <sessionId片段> <方案名>
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const [needle, plan] = process.argv.slice(2)
if (!needle || !plan) { console.error('usage: import-session.mjs <sessionId> <plan>'); process.exit(1) }
const root = join(homedir(), '.dsh', 'sessions')
const found = []
for (const group of readdirSync(root)) {
  const dir = join(root, group); try { readdirSync(dir) } catch { continue }
  for (const name of readdirSync(dir)) {
    if (!name.includes(needle)) continue
    const file = join(dir, name, 'session.v4.jsonl.zstd')
    try { readFileSync(file); found.push(file) } catch {}
  }
}
if (found.length === 0) { console.error('session not found'); process.exit(1) }
const raw = execFileSync('zstd', ['-dc', found[0]], { encoding: 'utf8' })
const skip = ['Current runtime context', '<system-reminder>', 'Time sampled']
const out = []
for (const line of raw.split('\n')) {
  if (!line.trim()) continue
  let event
  try { event = JSON.parse(line) } catch { continue }
  const type = event.type
  if (type !== 'user/message' && type !== 'assistant/message') continue
  const data = event.data ?? {}
  const text = type === 'user/message'
    ? (data.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('')
    : ((data.message?.content ?? []).filter(b => b.type === 'text').map(b => b.text).join(''))
  if (!text.trim() || skip.some(prefix => text.trimStart().startsWith(prefix))) continue
  if (type === 'assistant/message') data.turn = 1, data.step = 1
  out.push({ type, data })
}
const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'memory-echo', 'templates', `${plan}.jsonl`)
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, out.map(o => JSON.stringify(o)).join('\n') + '\n')
console.log(`imported ${out.length} messages -> ${target}`)
