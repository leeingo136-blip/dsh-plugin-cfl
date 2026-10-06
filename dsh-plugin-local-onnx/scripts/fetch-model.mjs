#!/usr/bin/env node
/**
 * Weight installer for the local ONNX account plugin.
 *
 * Pulls one quantized variant of `onnx-community/Qwen3-0.6B-ONNX` into this
 * package's own `models/` directory so the plugin needs no network at run
 * time. Everything the runtime may ask for is fetched: config, tokenizer,
 * generation defaults, and the selected precision's pair of files
 * (`model_<dtype>.onnx` plus its external-data sidecar when one exists).
 *
 * Usage:
 *   node scripts/fetch-model.mjs                 # int8 (default): stable CPU/wasm path
 *   node scripts/fetch-model.mjs --dtype q4f16   # smallest (570 MB), wants fp16-aware backends
 *   node scripts/fetch-model.mjs --dtype q4      # 919 MB, most broadly compatible
 *   node scripts/fetch-model.mjs --dtype fp16    # 1.2 GB, reference precision
 *   node scripts/fetch-model.mjs --list          # print what each dtype costs
 */
import { createWriteStream } from 'node:fs'
import { mkdir, rm, stat, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pipeline as streamPipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const MODEL_ID = 'onnx-community/Qwen3-0.6B-ONNX'
const REVISION = 'main'
const REMOTE = `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}`
const API_ROOT = `https://huggingface.co/api/models/${MODEL_ID}`

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(HERE, '..')
const DEST = join(PKG_ROOT, 'models', MODEL_ID)

/** Root-level files every dtype needs; absent ones are skipped silently. */
const ROOT_FILES = [
  'config.json',
  'generation_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'added_tokens.json',
  'vocab.json',
  'merges.txt',
]

/**
 * Precision variants offered by the upstream repo. `bytes` is advisory — the
 * real total is printed by `--list` from live API data before anything is
 * downloaded.
 */
const DTYPES = ['int8', 'q4f16', 'q4', 'fp16']

const args = parseArgs({
  allowPositionals: false,
  options: {
    dtype: { type: 'string', default: 'int8' },
    list: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
})

/** True when the path exists. */
async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Fetch JSON from one endpoint. */
async function getJson(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) return undefined
  return res.json()
}

/** List the files at one repo path, newest listing first. */
async function listDir(path = '') {
  const url = `${API_ROOT}/tree/${REVISION}${path === '' ? '' : `/${path}`}`
  const entries = await getJson(url)
  return Array.isArray(entries) ? entries : []
}

/** Sum sizes of every file the dtype needs, as reported by the API. */
async function dtypeSize(dtype) {
  const entries = await listDir('onnx')
  let total = 0
  const seen = []
  for (const entry of entries) {
    const name = entry.path === undefined ? '' : String(entry.path).replace(/^onnx\//, '')
    if (name !== `model_${dtype}.onnx` && name !== `model_${dtype}.onnx_data`) continue
    total += entry.size ?? 0
    seen.push(name)
  }
  return { total, seen }
}

/** Stream one remote file to disk. */
async function downloadFile(remotePath, destPath, label) {
  if (await exists(destPath)) {
    const info = await stat(destPath)
    console.log(`  · ${label}（已存在，${(info.size / 1e6).toFixed(1)} MB，跳过）`)
    return
  }
  const url = `${REMOTE}/${remotePath}`
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) {
    console.log(`  · ${label}（仓库无此文件，跳过）`)
    return
  }
  await mkdir(dirname(destPath), { recursive: true })
  const size = Number(res.headers.get('content-length') ?? 0)
  await streamPipeline(Readable.fromWeb(res.body), createWriteStream(destPath))
  const info = await stat(destPath)
  const shown = info.size / 1e6
  console.log(`  · ${label}：${shown.toFixed(1)} MB` + (size > 0 && Math.abs(size - info.size) > 1024 ? `（远端 ${(size / 1e6).toFixed(1)} MB）` : ''))
}

/** The whole job. */
async function main() {
  const dtype = args.values.dtype
  if (args.values.list) {
    console.log('可用精度（按实际文件体积）：')
    for (const candidate of DTYPES) {
      const { total, seen } = await dtypeSize(candidate)
      const mark = candidate === dtype ? ' ← 当前默认' : ''
      console.log(`  ${candidate.padEnd(6)} ${(total / 1e6).toFixed(1)} MB  [${seen.join(', ') || '无匹配文件'}]${mark}`)
    }
    return
  }
  if (!DTYPES.includes(dtype)) {
    console.error(`未知精度 "${dtype}"，可选：${DTYPES.join(' / ')}`)
    process.exitCode = 1
    return
  }
  const { seen } = await dtypeSize(dtype)
  if (seen.length === 0) {
    console.error(`仓库没有 model_${dtype}.onnx，请换一个精度（先跑 --list）。`)
    process.exitCode = 1
    return
  }
  console.log(`目标：${MODEL_ID} @ ${REVISION}`)
  console.log(`精度：${dtype}（${seen.join(' + ')}）`)
  console.log(`落盘：${DEST}`)
  if (args.values.force) {
    await rm(DEST, { recursive: true, force: true })
    console.log('  · 已清除旧权重目录（--force）')
  }
  await mkdir(DEST, { recursive: true })
  console.log('拉取根文件…')
  for (const file of ROOT_FILES) {
    await downloadFile(file, join(DEST, file), file)
  }
  console.log('拉取权重…')
  for (const file of seen) {
    await downloadFile(`onnx/${file}`, join(DEST, 'onnx', file), file)
  }
  const written = await readdir(join(DEST, 'onnx'))
  console.log(`完成。onnx/ 目录现有：${written.join(', ')}`)
  console.log('提示：运行时只加载这次选定的精度，务必与插件常量 DTYPE 一致。')
}

await main()
