import { getLlama, LlamaChatSession } from 'node-llama-cpp'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const llama = await getLlama()
const model = await llama.loadModel({ modelPath: join(here, 'models/Qwen3-0.6B-Q4_K_M.gguf') })

async function trial(label, history, prompt, maxTokens) {
  const context = await model.createContext({ contextSize: 4096 })
  const session = new LlamaChatSession({ contextSequence: context.getSequence() })
  if (history !== undefined) session.setChatHistory(history)
  let streamed = ''
  let calls = 0
  const returned = await session.prompt(prompt, {
    maxTokens,
    temperature: 0.7,
    topP: 0.9,
    onToken: (tokens) => {
      calls += 1
      streamed += model.detokenize(tokens)
    },
  })
  console.log(`${label}\n   returned=${JSON.stringify(String(returned).slice(0, 80))}\n   onToken calls=${calls} streamed=${JSON.stringify(streamed.slice(0, 80))}`)
  await context.dispose()
}

await trial('A budget 400, no history', undefined, '用一句话介绍你自己', 400)
await trial('B budget 400 + <arg_key:6124c78e>', undefined, '用一句话介绍你自己 <arg_key:6124c78e>', 200)
await trial('C budget 400 + history', [{ type: 'system', text: '你是简洁的助手' }, { type: 'user', text: '你好' }, { type: 'model', response: ['嗨，有什么可以帮你？'] }], '用一句话介绍你自己', 400)
process.exit(0)
