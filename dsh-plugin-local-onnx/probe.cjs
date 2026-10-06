// Probe v2: load through the package's real entry (main -> dist/transformers.node.cjs,
// the build that has fs). Run under both plain Node and Electron to see whether
// the runtime the desktop host uses can actually load and generate.
const { createRequire } = require('node:module')
const requireFromHere = createRequire(__filename)
const pkgPath = requireFromHere.resolve('@huggingface/transformers')
console.log('resolved entry:', pkgPath)

async function main() {
  console.log('node:', process.versions.node, 'modules:', process.versions.modules)
  const mod = await import(pkgPath)
  const env = mod.env ?? mod.default?.env
  console.log('useFS =', env.useFS, '| platform =', env.platform)
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = '/Users/infinite/WorkBuddy/20260424114504/dsh-plugin-local-onnx/models'
  const device = process.env.PROBE_DEVICE ?? 'cpu'
  console.log('device =', device)
  const gen = await mod.pipeline('text-generation', 'onnx-community/Qwen3-0.6B-ONNX', {
    dtype: 'int8', device, local_files_only: true,
  })
  console.log('pipeline ready')
  const out = await gen([{ role: 'user', content: '用一句话介绍自己' }], { max_new_tokens: 12, do_sample: false })
  console.log('generated:', JSON.stringify(out[0].generated_text).slice(0, 300))
  console.log('PROBE_OK')
}

main().catch((error) => {
  console.error('PROBE_FAIL:', error && error.message ? error.message : error)
  process.exit(1)
})
