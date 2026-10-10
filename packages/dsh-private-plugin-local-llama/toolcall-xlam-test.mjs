#!/usr/bin/env node
// Engine-level pre-flight for the xLAM tool-calling path of this plugin.
//
// It calls the SAME compiled code the harness adapter uses (dist/local-model.js):
// it builds the xLAM system prompt with a tool list, runs one generation, and
// checks whether the model's reply parses into tool calls. Run it to confirm
// the local model actually triggers harness's skill/tool loop before you try it
// inside the desktop app.
//
//   node toolcall-xlam-test.mjs
import {
  currentModelId, generate, isXLAMModel, parseToolCalls, weightsPresent,
} from './dist/local-model.js'

const tools = [
  {
    name: 'get_weather',
    description: 'Get the current weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City, e.g. Beijing' },
        unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
      },
      required: ['location'],
    },
  },
  {
    name: 'calculate',
    description: 'Evaluate a math expression',
    parameters: {
      type: 'object',
      properties: { expression: { type: 'string' } },
      required: ['expression'],
    },
  },
]

const messages = [
  { role: 'user', content: [{ type: 'text', text: '北京现在天气怎么样？顺便算一下 1234 乘以 56 等于多少。' }] },
]

console.log(`model: ${currentModelId()}  isXLAM: ${isXLAMModel()}  weightsPresent: ${weightsPresent()}`)
if (!weightsPresent()) {
  console.error('no weights — run: node scripts/fetch-model.mjs --variant xlam-2-3b')
  process.exit(1)
}

const result = await generate(messages, undefined, tools, { maxTokens: 1024, temperature: 0.3, topP: 0.9 })

let streamed = ''
for await (const piece of result.stream) streamed += piece.text
const full = await result.fullText
const usage = await result.done

console.log('--- streamed text ---')
console.log(streamed)
console.log('--- raw full output ---')
console.log(full)
console.log('--- parsed tool calls (what harness would receive) ---')
console.log(JSON.stringify(parseToolCalls(full), null, 2))
console.log('--- usage ---')
console.log(usage)
