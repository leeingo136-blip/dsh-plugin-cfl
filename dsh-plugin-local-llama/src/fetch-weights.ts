/**
 * In-process weight downloader.
 *
 * The card's enable gesture doubles as the fetch trigger: when no `.gguf` is
 * present in `models/`, enabling downloads the default xLAM weight directly
 * from HuggingFace (mirroring what `scripts/fetch-model.mjs` does offline) and
 * reports progress back so the account card can read 「下载中… 45%」.
 *
 * Mirrors are tried in order — `hf-mirror.com` exists because the canonical
 * host is unreachable from some networks. A partially downloaded file lands at
 * `<file>.part` and is renamed into place only after the stream completes, so
 * an interrupted run never leaves a truncated blob that the engine would
 * happily load.
 */
import { createWriteStream } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web'
import { modelRoot } from './local-model.ts'

/** The default variant, matching `scripts/fetch-model.mjs`. */
const REPO = 'Salesforce/xLAM-2-3b-fc-r-gguf'
const FILE = 'xLAM-2-3B-fc-r-Q4_K_M.gguf'

/** Hosts tried in order; the first successful download wins. */
const MIRRORS = ['https://huggingface.co', 'https://hf-mirror.com']

/** Smallest progress delta worth publishing, in bytes (~16 MB). */
const REPORT_STEP = 16 * 1e6

/**
 * Download the default weight into `models/`, reporting progress as a short
 * human-readable string (`870 MB / 1.9 GB（45%）`). Resolves once the file is
 * renamed into place; rejects on network failure or abort.
 */
export async function downloadWeights(
  onProgress: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const dir = modelRoot()
  await mkdir(dir, { recursive: true })
  const target = join(dir, FILE)
  const temporary = `${target}.part`

  // Publish at most one line per step so the card text does not flicker.
  let lastText = ''
  const report = (received: number, total: number): void => {
    const text = total > 0
      ? `${(received / 1e6).toFixed(0)} MB / ${(total / 1e9).toFixed(2)} GB（${Math.round((received / total) * 100)}%）`
      : `${(received / 1e6).toFixed(0)} MB`
    if (text === lastText) return
    lastText = text
    onProgress(text)
  }

  let lastError: unknown
  for (const base of MIRRORS) {
    try {
      const url = `${base}/${REPO}/resolve/main/${FILE}`
      const response = await fetch(url, { signal, redirect: 'follow' })
      if (!response.ok || response.body === null) {
        throw new Error(`HTTP ${response.status}`)
      }
      const total = Number(response.headers.get('content-length') ?? 0)
      let received = 0
      let lastReport = 0
      const progress = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk) {
          received += chunk.byteLength
          if (received - lastReport >= REPORT_STEP || (total > 0 && received >= total)) {
            lastReport = received
            report(received, total)
          }
        },
      })
      await pipeline(
        Readable.fromWeb(
          response.body.pipeThrough(progress) as unknown as NodeWebReadableStream<Uint8Array>,
        ),
        createWriteStream(temporary),
        { signal },
      )
      await rename(temporary, target)
      const done = await stat(target)
      report(done.size, done.size)
      return
    } catch (error) {
      lastError = error
      // An abort is a user decision, not a network condition: do not fall
      // through to the next mirror.
      if (signal.aborted) throw error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
