// Build-level smoke test: does the compiled engine stream a reply under the
// runtime that actually loads plugins (Electron)? No UI involved.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const mod = await import(join(here, 'dist/local-model.js'))

console.log('weightsPresent =', mod.weightsPresent())
console.log('modelRoot =', mod.modelRoot())

const started = Date.now()
await mod.warmup()
console.log('warmup in', Date.now() - started, 'ms')

const messages = mod.toChatMessages(
  [
    { role: 'user', content: [{ type: 'text', text: '用一句话介绍你自己' }] },
    { role: 'assistant', content: [{ type: 'text', text: '好的。' }] },
    { role: 'user', content: [{ type: 'text', text: '再说一遍' }] },
  ],
  '你是简洁的助手',
)
console.log('normalized =', JSON.stringify(messages))

const result = await mod.generate(messages, { maxTokens: 300, temperature: 0.7, topP: 0.9 })
let answer = ''
let reasoning = ''
let pieces = 0
for await (const piece of result.stream) {
  pieces += 1
  if (piece.kind === 'reasoning') reasoning += piece.text
  else answer += piece.text
}
const usage = await result.done
console.log('pieces =', pieces)
console.log('answer =', JSON.stringify(answer.slice(0, 200)))
console.log('reasoning =', JSON.stringify(reasoning.slice(0, 120)))
console.log('usage =', JSON.stringify(usage))
console.log('SMOKE_OK')
process.exit(0)
