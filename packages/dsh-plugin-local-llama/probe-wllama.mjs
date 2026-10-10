// Prove the WASM path works under the runtime that actually loads plugins.
// Run with plain Node and with Electron; both must print PROBE_OK.
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const wasmDir = join(here, 'node_modules/@wllama/wllama/esm/wasm')
const modelPath = join(here, 'models/Qwen3-0.6B-Q4_K_M.gguf')

async function main() {
  console.log('node:', process.versions.node, 'modules:', process.versions.modules)
  const mod = await import(join(here, 'node_modules/@wllama/wllama/esm/index.js'))
  console.log('wllama imported, has Wllama =', typeof mod.Wllama)
  // wllama's cache targets browser storage (OPFS), which does not exist here;
  // a no-op cache is enough because the weights come from a local Blob.
  const noopCache = {
    isSupported: () => true,
    list: async () => [],
    clear: async () => {},
    write: async () => {},
    download: async () => {},
    open: async () => null,
    delete: async () => {},
    deleteMany: async () => {},
    getNameFromURL: (url) => url,
  }
  const instance = new mod.Wllama({ default: wasmDir }, { suppressNativeLog: true, cacheManager: noopCache })
  const bytes = await readFile(modelPath)
  console.log('gguf bytes:', bytes.length)
  const started = Date.now()
  await instance.loadModel([new Blob([bytes])], { n_ctx: 4096 })
  console.log('model loaded in', Date.now() - started, 'ms')

  let out = ''
  let reasoning = ''
  const genStart = Date.now()
  await instance.createChatCompletion({
    messages: [{ role: 'user', content: '用一句话介绍你自己' }],
    nPredict: 32,
    sampling: { temp: 0.7, top_p: 0.9 },
    stream: true,
    onData: (chunk) => {
      const delta = chunk?.choices?.[0]?.delta ?? {}
      if (typeof delta.reasoning_content === 'string') reasoning += delta.reasoning_content
      if (typeof delta.content === 'string') out += delta.content
    },
  })
  console.log('generated in', Date.now() - genStart, 'ms')
  console.log('answer:', JSON.stringify(out.slice(0, 160)))
  console.log('reasoning:', JSON.stringify(reasoning.slice(0, 120)))
  console.log('PROBE_OK')
}

main().catch((error) => {
  console.error('PROBE_FAIL:', error?.stack ?? error)
  process.exit(1)
})
