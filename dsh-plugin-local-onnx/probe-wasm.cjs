// Probe v3: the zero-native path. Import the WEB build (its only device is the
// WASM backend, so no .node binary is ever loaded) and serve local weights by
// overriding env.fetch — the web build has useFS=false and would otherwise try
// to fetch('/Users/...'). Run under Electron to prove the ABI problem is gone.
const { createRequire } = require('node:module')
const { readFile } = require('node:fs/promises')
const { existsSync } = require('node:fs')
const path = require('node:path')

const requireFromHere = createRequire(__filename)
// The package exports only its node entry; sibling web build sits next to it.
const NODE_ENTRY = requireFromHere.resolve('@huggingface/transformers')
const DIST_DIR = path.dirname(NODE_ENTRY)
const PKG_DIR = path.dirname(DIST_DIR)
const WEB_ENTRY = path.join(DIST_DIR, 'transformers.js')
const MODEL_ROOT = '/Users/infinite/WorkBuddy/20260424114504/dsh-plugin-local-onnx/models'

/** Serve a local path as a fetch Response; anything else stays remote-denied. */
async function localFetch(urlOrPath) {
  const target = typeof urlOrPath === 'string' ? urlOrPath : String(urlOrPath)
  if (!target.startsWith('http')) {
    if (!existsSync(target)) return new Response(null, { status: 404 })
    const body = await readFile(target)
    return new Response(body, { status: 200, headers: { 'content-type': 'application/octet-stream' } })
  }
  throw new Error(`remote fetch refused: ${target}`)
}

async function main() {
  console.log('node:', process.versions.node, 'modules:', process.versions.modules)
  const mod = await import(WEB_ENTRY)
  const env = mod.env ?? mod.default?.env
  console.log('useFS =', env.useFS)
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = MODEL_ROOT
  env.fetch = localFetch
  const wasm = env.backends?.onnx?.wasm ?? {}
  wasm.wasmPaths = path.join(PKG_DIR, 'dist/')
  console.log('wasmPaths =', wasm.wasmPaths)

  const gen = await mod.pipeline('text-generation', 'onnx-community/Qwen3-0.6B-ONNX', {
    dtype: 'int8', device: process.env.PROBE_DEVICE ?? 'cpu', local_files_only: true,
  })
  console.log('pipeline ready')
  const out = await gen([{ role: 'user', content: '用一句话介绍自己' }], { max_new_tokens: 12, do_sample: false })
  console.log('generated:', JSON.stringify(out[0].generated_text).slice(0, 300))
  console.log('PROBE_OK')
}

main().catch((error) => {
  console.error('PROBE_FAIL:', error && error.stack ? error.stack.split('\n').slice(0, 4).join('\n') : error)
  process.exit(1)
})
