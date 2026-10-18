/**
 * RAG connection registry — the memory-recall card model.
 *
 * A "card" is one saved connection to a RAG database, not the database
 * itself: name (unique, the handle tools pass as a parameter), kind (which
 * linking strategy to use), address (file path for local, URL for a
 * service), and the embedding engine the connection binds. The registry is
 * one self-contained JSON file under the package's own `data/memory/`
 * directory — the same in-repo posture as the local model weights. Actual
 * linking (sqlite-vec open, HTTP transport) lives with the tools that
 * consume the cards and lands later.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

/** The package's own data root, computed from the compiled module location. */
const DATA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/memory')

/** Which linking strategy a connection uses. */
export type ConnectionKind = 'local' | 'service'

export const CONNECTION_KINDS: readonly ConnectionKind[] = ['local', 'service']

export interface ConnectionRecord {
  id: string
  /** Unique, tool-facing handle (the value tools pass as the database parameter). */
  name: string
  description: string
  kind: ConnectionKind
  /** Local: database file path. Service: endpoint URL. */
  address: string
  /** The embedding engine this connection binds (embedding model id). */
  embeddingModel: string
  createdAt: string
  updatedAt: string
}

interface Registry {
  connections: ConnectionRecord[]
}

function registryPath(): string {
  return join(DATA_ROOT, 'connections.json')
}

function readRegistry(): Registry {
  try {
    const raw = JSON.parse(readFileSync(registryPath(), 'utf8')) as Registry
    return { connections: Array.isArray(raw.connections) ? raw.connections : [] }
  } catch {
    return { connections: [] }
  }
}

function writeRegistry(registry: Registry): void {
  mkdirSync(DATA_ROOT, { recursive: true })
  writeFileSync(registryPath(), JSON.stringify(registry, null, 2))
}

/** Field-level validation shared by create and update. */
export interface ConnectionInput {
  name?: unknown
  description?: unknown
  kind?: unknown
  address?: unknown
  embeddingModel?: unknown
}

export function normalizeName(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

/** The error reasons a create/update can fail with, for the wire face. */
export type ConnectionFault =
  | { code: 'name-required' }
  | { code: 'name-duplicate'; name: string }
  | { code: 'kind-unknown' }
  | { code: 'address-required' }
  | { code: 'embedding-required' }

/**
 * Validate one card input against the registry. Returns the fault on
 * failure — the controller maps it onto the RemoteError vocabulary.
 */
export function validate(
  input: ConnectionInput,
  existing: readonly ConnectionRecord[],
  selfId?: string,
): ConnectionFault | undefined {
  const name = normalizeName(input.name)
  if (name === '') return { code: 'name-required' }
  const clash = existing.some(one => one.name === name && one.id !== selfId)
  if (clash) return { code: 'name-duplicate', name }
  if (input.kind !== undefined && !CONNECTION_KINDS.includes(input.kind as ConnectionKind)) {
    return { code: 'kind-unknown' }
  }
  const address = typeof input.address === 'string' ? input.address.trim() : ''
  if (address === '') return { code: 'address-required' }
  const model = typeof input.embeddingModel === 'string' ? input.embeddingModel.trim() : ''
  if (model === '') return { code: 'embedding-required' }
  return undefined
}

/**
 * The connection card registry. Pure JSON CRUD — no database is opened
 * here; cards describe how to reach one, and the tools open it.
 */
export class ConnectionStore {
  /** Every saved card, creation order preserved. */
  list(): ConnectionRecord[] {
    return readRegistry().connections
  }

  /** One card by id. */
  get(id: string): ConnectionRecord | undefined {
    return readRegistry().connections.find(one => one.id === id)
  }

  /** Create one card from validated input. */
  create(input: ConnectionInput): ConnectionRecord {
    const now = new Date().toISOString()
    const record: ConnectionRecord = {
      id: randomUUID(),
      name: normalizeName(input.name),
      description: typeof input.description === 'string' ? input.description.trim() : '',
      kind: (input.kind as ConnectionKind | undefined) ?? 'local',
      address: (input.address as string | undefined)?.trim() ?? '',
      embeddingModel: (input.embeddingModel as string | undefined)?.trim() ?? '',
      createdAt: now,
      updatedAt: now,
    }
    const registry = readRegistry()
    registry.connections.push(record)
    writeRegistry(registry)
    return record
  }

  /** Update one card in place; only provided fields change. */
  update(id: string, input: ConnectionInput): ConnectionRecord | undefined {
    const registry = readRegistry()
    const record = registry.connections.find(one => one.id === id)
    if (record === undefined) return undefined
    if (input.name !== undefined) record.name = normalizeName(input.name)
    if (input.description !== undefined) record.description = (input.description as string).trim()
    if (input.kind !== undefined) record.kind = input.kind as ConnectionKind
    if (input.address !== undefined) record.address = (input.address as string).trim()
    if (input.embeddingModel !== undefined) record.embeddingModel = (input.embeddingModel as string).trim()
    record.updatedAt = new Date().toISOString()
    writeRegistry(registry)
    return record
  }

  /** Delete one card. Returns false when the id is unknown. */
  remove(id: string): boolean {
    const registry = readRegistry()
    const before = registry.connections.length
    registry.connections = registry.connections.filter(one => one.id !== id)
    if (registry.connections.length === before) return false
    writeRegistry(registry)
    return true
  }
}

/** Dev sanity helper: the data root this store writes into. */
export function dataRoot(): string {
  if (!existsSync(DATA_ROOT)) mkdirSync(DATA_ROOT, { recursive: true })
  return DATA_ROOT
}
