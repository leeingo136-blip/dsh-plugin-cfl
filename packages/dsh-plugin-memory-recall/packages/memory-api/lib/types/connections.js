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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
/** The package's own data root, computed from the compiled module location. */
const DATA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/memory');
export const CONNECTION_KINDS = ['local', 'service'];
function registryPath() {
    return join(DATA_ROOT, 'connections.json');
}
function readRegistry() {
    try {
        const raw = JSON.parse(readFileSync(registryPath(), 'utf8'));
        return { connections: Array.isArray(raw.connections) ? raw.connections : [] };
    }
    catch {
        return { connections: [] };
    }
}
function writeRegistry(registry) {
    mkdirSync(DATA_ROOT, { recursive: true });
    writeFileSync(registryPath(), JSON.stringify(registry, null, 2));
}
export function normalizeName(value) {
    if (typeof value !== 'string')
        return '';
    return value.trim();
}
/**
 * Validate one card input against the registry. Returns the fault on
 * failure — the controller maps it onto the RemoteError vocabulary.
 */
export function validate(input, existing, selfId) {
    const name = normalizeName(input.name);
    if (name === '')
        return { code: 'name-required' };
    const clash = existing.some(one => one.name === name && one.id !== selfId);
    if (clash)
        return { code: 'name-duplicate', name };
    if (input.kind !== undefined && !CONNECTION_KINDS.includes(input.kind)) {
        return { code: 'kind-unknown' };
    }
    const address = typeof input.address === 'string' ? input.address.trim() : '';
    if (address === '')
        return { code: 'address-required' };
    const model = typeof input.embeddingModel === 'string' ? input.embeddingModel.trim() : '';
    if (model === '')
        return { code: 'embedding-required' };
    return undefined;
}
/**
 * The connection card registry. Pure JSON CRUD — no database is opened
 * here; cards describe how to reach one, and the tools open it.
 */
export class ConnectionStore {
    /** Every saved card, creation order preserved. */
    list() {
        return readRegistry().connections;
    }
    /** One card by id. */
    get(id) {
        return readRegistry().connections.find(one => one.id === id);
    }
    /** Create one card from validated input. */
    create(input) {
        const now = new Date().toISOString();
        const record = {
            id: randomUUID(),
            name: normalizeName(input.name),
            description: typeof input.description === 'string' ? input.description.trim() : '',
            kind: input.kind ?? 'local',
            address: input.address?.trim() ?? '',
            embeddingModel: input.embeddingModel?.trim() ?? '',
            createdAt: now,
            updatedAt: now,
        };
        const registry = readRegistry();
        registry.connections.push(record);
        writeRegistry(registry);
        return record;
    }
    /** Update one card in place; only provided fields change. */
    update(id, input) {
        const registry = readRegistry();
        const record = registry.connections.find(one => one.id === id);
        if (record === undefined)
            return undefined;
        if (input.name !== undefined)
            record.name = normalizeName(input.name);
        if (input.description !== undefined)
            record.description = input.description.trim();
        if (input.kind !== undefined)
            record.kind = input.kind;
        if (input.address !== undefined)
            record.address = input.address.trim();
        if (input.embeddingModel !== undefined)
            record.embeddingModel = input.embeddingModel.trim();
        record.updatedAt = new Date().toISOString();
        writeRegistry(registry);
        return record;
    }
    /** Delete one card. Returns false when the id is unknown. */
    remove(id) {
        const registry = readRegistry();
        const before = registry.connections.length;
        registry.connections = registry.connections.filter(one => one.id !== id);
        if (registry.connections.length === before)
            return false;
        writeRegistry(registry);
        return true;
    }
}
/** Dev sanity helper: the data root this store writes into. */
export function dataRoot() {
    if (!existsSync(DATA_ROOT))
        mkdirSync(DATA_ROOT, { recursive: true });
    return DATA_ROOT;
}
/**
 * Where tool-managed local databases live by default — inside the package's
 * own data root, keeping the in-repo self-contained posture. The editor
 * prefills local addresses here so cards stay inside the plugin by default.
 */
export function localDatabaseDir() {
    const dir = join(DATA_ROOT, 'databases');
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    return dir;
}
//# sourceMappingURL=connections.js.map