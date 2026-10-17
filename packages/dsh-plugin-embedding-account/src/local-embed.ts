/**
 * The local embedding engine: llama.cpp embedding inference in-process through
 * node-llama-cpp, reading one vendored GGUF weight from `models/`.
 *
 * The same runtime backs the chat sibling (dsh-plugin-llama-local): pnpm
 * resolves both packages onto one `node-llama-cpp` install, so the native
 * binding — already verified under the Electron ABI there — loads once and
 * both engines share it. Embedding inference runs a single forward pass per
 * input and allocates no generation KV cache, so the context stays small and
 * every call is fast; a ~100 MB Q8 weight is the steady-state memory cost.
 *
 * Everything resolves from `import.meta.url` — the host never runs with this
 * package as its working directory. The engine is imported dynamically so
 * that merely loading the plugin never pays for reading a model file.
 */
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** This package's root, computed from the compiled module's own location. */
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Where the vendored weight lives. */
export function modelRoot(): string {
  return join(PACKAGE_ROOT, 'models')
}

/** The engine auto-selects the first GGUF whose name marks it an embedding weight. */
const EMBED_PATTERN = /bge|embed|nomic|gte|e5/i

/** One vendored embedding weight found on disk. */
export interface EmbedWeight {
  file: string
  path: string
}

/** Scan `models/` for an embedding GGUF; undefined when none is present. */
export function selectWeight(): EmbedWeight | undefined {
  let files: string[] = []
  try {
    files = readdirSync(modelRoot()).filter((name) => name.endsWith('.gguf'))
  } catch {
    files = []
  }
  const file = files.find((name) => EMBED_PATTERN.test(name)) ?? files[0]
  if (file === undefined) return undefined
  const path = join(modelRoot(), file)
  return existsSync(path) ? { file, path } : undefined
}

/** True once a weight file is on disk. */
export function weightPresent(): boolean {
  return selectWeight() !== undefined
}

/** The weight file name, or the expected default for error copy. */
export function currentWeightFile(): string {
  return selectWeight()?.file ?? 'bge-small-zh-v1.5.gguf'
}

/**
 * The narrow engine shapes used here, declared locally so the loosely typed
 * package surface never leaks into the rest of the plugin.
 */
interface EmbeddingContextLike {
  getEmbeddingFor(input: string): Promise<{ vector: ArrayLike<number> }>
  dispose(): Promise<void>
}
interface EmbeddingModelLike {
  createEmbeddingContext(): Promise<EmbeddingContextLike>
  dispose(): Promise<void>
}
interface LlamaModule {
  getLlama(): Promise<{ loadModel(options: { modelPath: string }): Promise<EmbeddingModelLike> }>
}

/** Live engine handles; all three set together once loading succeeds. */
let loaded: {
  model: EmbeddingModelLike
  context: EmbeddingContextLike
  file: string
} | undefined
/** In-flight engine load, shared so concurrent callers await one load. */
let pending: Promise<void> | undefined
/** Why the last load or embed failed, cleared on the next success. */
let lastError: string | undefined
/** Vector width, learned from the first successful embed. */
let dimensions = 0

/** Serialized request chain: one context, one forward pass at a time. */
let tail: Promise<unknown> = Promise.resolve()

/** Run one queued task, isolated so a rejection never breaks the chain. */
function queued<T>(task: () => Promise<T>): Promise<T> {
  const result = tail.then(task, task)
  tail = result.then(() => undefined, () => undefined)
  return result
}

/** Load the engine once: import the binding, adopt the weights, open a context. */
function ensureLoaded(): Promise<void> {
  pending ??= (async () => {
    const weight = selectWeight()
    if (weight === undefined) {
      throw new Error(
        `本地未找到向量模型权重（models/ 下无 .gguf）。请在插件目录执行：node scripts/fetch-model.mjs`,
      )
    }
    try {
      const mod = await import('node-llama-cpp') as unknown as LlamaModule
      const llama = await mod.getLlama()
      const model = await llama.loadModel({ modelPath: weight.path })
      const context = await model.createEmbeddingContext()
      loaded = { model, context, file: weight.file }
      lastError = undefined
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      throw error
    }
  })()
  return pending
}

/** True while the engine holds a loaded weight. */
export function isLoaded(): boolean {
  return loaded !== undefined
}

/** The loaded weight's file name, or undefined before the first load. */
export function loadedFile(): string | undefined {
  return loaded?.file
}

/** Vector width; 0 until the first successful embed. */
export function currentDimensions(): number {
  return dimensions
}

/** Why the last load or embed failed, undefined otherwise. */
export function lastFailure(): string | undefined {
  return lastError
}

/** Whether the weight will be reachable when needed. */
export function ready(): boolean {
  return loaded !== undefined || weightPresent()
}

/**
 * Embed one batch of texts, loading the engine on first use.
 *
 * Inputs run sequentially through the one context; an oversized batch only
 * costs time, never memory. The failure of one input fails the whole batch —
 * callers chunk if they need partial progress.
 */
export async function embed(inputs: readonly string[]): Promise<number[][]> {
  if (inputs.length === 0) return []
  return queued(async () => {
    await ensureLoaded()
    const context = loaded!.context
    const vectors: number[][] = []
    for (const input of inputs) {
      const embedding = await context.getEmbeddingFor(input)
      vectors.push(Array.from(embedding.vector, (value) => value))
    }
    if (dimensions === 0 && vectors[0] !== undefined) {
      dimensions = vectors[0]!.length
    }
    lastError = undefined
    return vectors
  })
}

/** Cosine similarity of two vectors; 0 when either is empty or lengths differ. */
export function similarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index]! * b[index]!
    normA += a[index]! * a[index]!
    normB += b[index]! * b[index]!
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/** Release the weight and its context; safe to call when nothing is loaded. */
export async function unload(): Promise<void> {
  await queued(async () => {
    const current = loaded
    if (current === undefined) return
    loaded = undefined
    pending = undefined
    try {
      await current.context.dispose()
    } catch {
      // A context dispose failure must not block releasing the model.
    }
    try {
      await current.model.dispose()
    } catch {
      // Same: best-effort release, the next load rebuilds everything.
    }
  })
}
