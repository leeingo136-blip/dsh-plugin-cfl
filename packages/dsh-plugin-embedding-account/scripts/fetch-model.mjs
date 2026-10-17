#!/usr/bin/env node
/**
 * Fetch the vendored embedding weight into `models/`.
 *
 * Downloads the bge-small-zh-v1.5 Q8_0 GGUF (~35 MB) from hf-mirror first,
 * then huggingface.co. The file name matches the engine's EMBED_PATTERN, so
 * the next plugin activation finds it without configuration.
 */
import { createWriteStream, mkdirSync, renameSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODELS = join(PACKAGE_ROOT, 'models')
const TARGET = 'bge-small-zh-v1.5-q8_0.gguf'
const DEST = join(MODELS, TARGET)
const SOURCES = [
  `https://hf-mirror.com/CompendiumLabs/bge-small-zh-v1.5-gguf/resolve/main/${TARGET}`,
  `https://huggingface.co/CompendiumLabs/bge-small-zh-v1.5-gguf/resolve/main/${TARGET}`,
]

if (existsSync(DEST) && statSync(DEST).size > 1_000_000) {
  console.log(`已存在：${DEST}`)
  process.exit(0)
}

mkdirSync(MODELS, { recursive: true })
let lastError
for (const url of SOURCES) {
  try {
    console.log(`下载 ${url}`)
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
    const temp = `${DEST}.part`
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temp))
    renameSync(temp, DEST)
    const size = statSync(DEST).size
    console.log(`完成：${DEST}（${(size / 1024 / 1024).toFixed(1)} MB）`)
    process.exit(0)
  } catch (error) {
    lastError = error
    console.warn(`源失败：${error.message ?? error}`)
  }
}
console.error(`全部源失败：${lastError?.message ?? lastError}`)
process.exit(1)
