// Prove the native llama.cpp binding survives Electron's ABI, using the same
// GGUF the plugin will ship. Must print PROBE_OK under the Electron binary.
import { getLlama, LlamaChatSession } from 'node-llama-cpp'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const modelPath = join(here, 'models/Qwen3-0.6B-Q4_K_M.gguf')

async function main() {
  console.log('node:', process.versions.node, 'modules:', process.versions.modules)
  const llama = await getLlama()
  console.log('llama obtained')
  const started = Date.now()
  const model = await llama.loadModel({ modelPath })
  console.log('model loaded in', Date.now() - started, 'ms')
  const context = await model.createContext({ contextSize: 4096 })
  const session = new LlamaChatSession({ contextSequence: context.getSequence() })
  const genStart = Date.now()
  let streamed = ''
  const answer = await session.prompt('用一句话介绍你自己', {
    maxTokens: 400,
    onToken: (chunks) => {
      for (const chunk of chunks) streamed += model.detokenize(chunk)
    },
  })
  console.log('generated in', Date.now() - genStart, 'ms')
  console.log('answer:', JSON.stringify(String(answer)))
  console.log('streamed:', JSON.stringify(streamed.slice(0, 400)))
  console.log('PROBE_OK')
}

main().catch((error) => {
  console.error('PROBE_FAIL:', error?.stack ?? error)
  process.exit(1)
})
