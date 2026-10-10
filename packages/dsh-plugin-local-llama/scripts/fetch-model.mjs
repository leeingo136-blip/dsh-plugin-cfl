#!/usr/bin/env node
// Fetch the GGUF weight this plugin loads.
//
// The file is the whole model: one quantized blob llama.cpp reads directly.
// It is deliberately not committed — a couple of gigabytes per precision would
// make the repository unusable — so this script is how a fresh checkout gets
// one.
//
//   node scripts/fetch-model.mjs                 # download the default variant
//   node scripts/fetch-model.mjs --list         # show every named variant
//   node scripts/fetch-model.mjs --variant xlam-2-3b
//   node scripts/fetch-model.mjs --variant qwen3-0.6b
//   node scripts/fetch-model.mjs --variant xLAM-2-3B-fc-r-Q4_K_M.gguf   # raw filename
//   node scripts/fetch-model.mjs --force        # re-download even if present
//
// The engine auto-detects which GGUF is present (preferring xLAM when both
// exist), so switching models is a matter of downloading a different file —
// no code change needed.
import { createWriteStream } from 'node:fs'
import { mkdir, stat, rename } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL_DIR = join(PACKAGE_ROOT, 'models')

/**
 * Named model variants. The first one flagged `default` is what a bare
 * `fetch-model.mjs` fetches. Each pulls a single quantized GGUF from a
 * HuggingFace repository.
 */
const MODELS = {
  'xlam-2-3b': {
    repo: 'Salesforce/xLAM-2-3b-fc-r-gguf',
    file: 'xLAM-2-3B-fc-r-Q4_K_M.gguf',
    note: 'xLAM-2 function-calling model (Qwen2.5-3B base). Trained for tool use.',
    default: true,
  },
  'qwen3-0.6b': {
    repo: 'lmstudio-community/Qwen3-0.6B-GGUF',
    file: 'Qwen3-0.6B-Q4_K_M.gguf',
    note: 'Qwen3-0.6B general chat model. Small; cannot call tools reliably.',
  },
}

const DEFAULT_NAME = Object.keys(MODELS).find((key) => MODELS[key].default) ?? Object.keys(MODELS)[0]

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const value = (name) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}

/** Resolve a --variant value to a concrete {repo, file}. */
function resolveVariant(requested) {
  if (requested === undefined) return { name: DEFAULT_NAME, ...MODELS[DEFAULT_NAME] }
  if (MODELS[requested] !== undefined) return { name: requested, ...MODELS[requested] }
  // Bare filename: assume it lives in the default model's repository.
  const base = MODELS[DEFAULT_NAME]
  return { name: requested, repo: base.repo, file: requested }
}

/** List the repository's GGUF files with their real sizes. */
async function listVariants(repo) {
  const response = await fetch(`https://huggingface.co/api/models/${repo}/tree/main`)
  if (!response.ok) throw new Error(`listing ${repo} failed: HTTP ${response.status}`)
  const entries = await response.json()
  return entries
    .filter((entry) => typeof entry.path === 'string' && entry.path.endsWith('.gguf'))
    .map((entry) => ({ path: entry.path, size: entry.size ?? 0 }))
    .sort((left, right) => left.size - right.size)
}

/** Download one file to a temporary name, then move it into place. */
async function download(variant, force) {
  await mkdir(MODEL_DIR, { recursive: true })
  const target = join(MODEL_DIR, variant.file)
  if (!force) {
    const existing = await stat(target).catch(() => undefined)
    if (existing !== undefined) {
      console.log(`already present: ${variant.file} (${(existing.size / 1e6).toFixed(1)} MB)`)
      return
    }
  }
  const url = `https://huggingface.co/${variant.repo}/resolve/main/${variant.file}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`download failed: HTTP ${response.status} — ${url}`)
  const total = Number(response.headers.get('content-length') ?? 0)
  const temporary = `${target}.part`
  let received = 0
  let lastReport = 0
  const progress = new TransformStreamBytes((delta) => {
    received += delta
    if (received - lastReport < 20 * 1e6) return
    lastReport = received
    const pct = total > 0 ? ((received / total) * 100).toFixed(0) : '??'
    process.stdout.write(`\r  ${(received / 1e6).toFixed(0)} MB (${pct}%)`)
  })
  await pipeline(
    Readable.fromWeb(response.body.pipeThrough(progress)),
    createWriteStream(temporary),
  )
  await rename(temporary, target)
  const done = await stat(target)
  console.log(`\r  ${(done.size / 1e6).toFixed(1)} MB (100%)`)
  console.log(`saved ${target}`)
}

/** A pass-through that reports how many bytes went by. */
function TransformStreamBytes(onBytes) {
  return new TransformStream({
    transform(chunk, controller) {
      onBytes(chunk.byteLength)
      controller.enqueue(chunk)
    },
  })
}

const requested = value('variant')
if (flag('list')) {
  for (const [key, model] of Object.entries(MODELS)) {
    const mark = model.default ? ' (default)' : ''
    console.log(`  ${key.padEnd(14)} ${model.file.padEnd(34)} ${model.note}${mark}`)
  }
} else {
  const variant = resolveVariant(requested)
  console.log(`downloading ${variant.file} from ${variant.repo}`)
  if (variant.note) console.log(`  ${variant.note}`)
  await download(variant, flag('force'))
  if (requested !== undefined && MODELS[requested] === undefined && !requested.endsWith('.gguf')) {
    console.log('note: unknown variant name; treated as a raw filename in the default repo')
  }
}
