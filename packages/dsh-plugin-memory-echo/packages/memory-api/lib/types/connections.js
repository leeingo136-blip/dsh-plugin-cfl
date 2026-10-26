/**
 * 角色卡注册表：cards.json 保存“方案级配置”，SQLite 文件只存人物信息
 * （self / persons / objects / memories），不再往库里写 plan/embedding 等方案字段。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCardDb, openCardDb, readCard, readMeta, writeCard } from "./card-db.js";
const DATA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/memory-echo');
export const PLAN_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;
export function normalizeName(value) { return typeof value === 'string' ? value.trim() : ''; }
export function normalizePlan(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
export function localDatabaseDir() {
    const dir = join(DATA_ROOT, 'databases');
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    return dir;
}
export function dataRoot() {
    if (!existsSync(DATA_ROOT))
        mkdirSync(DATA_ROOT, { recursive: true });
    return DATA_ROOT;
}
export function defaultAddress(plan) { return join(localDatabaseDir(), `${plan}.sqlite`); }
function registryPath() { return join(dataRoot(), 'cards.json'); }
function readRegistry() {
    try {
        const raw = JSON.parse(readFileSync(registryPath(), 'utf8'));
        return { cards: Array.isArray(raw.cards) ? raw.cards : [] };
    }
    catch {
        return { cards: [] };
    }
}
function writeRegistry(registry) {
    writeFileSync(registryPath(), JSON.stringify(registry, null, 2));
}
/** 旧库 meta 里还留着 plan/embedding：只读取一次用于建立注册表。 */
function legacyMeta(address) {
    try {
        const db = openCardDb(address);
        try {
            const meta = { plan: readMeta(db, 'plan'), embeddingModel: readMeta(db, 'embedding_model'), basePreset: readMeta(db, 'base_preset') };
            db.exec('DROP TABLE IF EXISTS meta');
            return meta;
        }
        finally {
            db.close();
        }
    }
    catch {
        return { plan: '', embeddingModel: '', basePreset: '' };
    }
}
/** 首次运行：扫描 databases/ 建立 cards.json（方案字段从旧 meta 或文件名推断）。 */
export function migrateLegacyCards() {
    const registry = readRegistry();
    if (registry.cards.length > 0)
        return 0;
    let count = 0;
    for (const file of readdirSync(localDatabaseDir())) {
        if (!file.endsWith('.sqlite'))
            continue;
        const address = join(localDatabaseDir(), file);
        const meta = legacyMeta(address);
        const plan = meta.plan !== '' ? normalizePlan(meta.plan) : normalizePlan(file.replace(/\.sqlite$/u, ''));
        if (plan === '')
            continue;
        registry.cards.push({ plan, address, embeddingModel: meta.embeddingModel, basePreset: meta.basePreset, injectGroups: 10 });
        count += 1;
    }
    if (count > 0)
        writeRegistry(registry);
    return count;
}
function toRecord(entry) {
    const content = readCard(entry.address);
    if (content === undefined)
        return undefined;
    return { ...entry, id: entry.plan, name: content.name, persona: content.persona, createdAt: '', updatedAt: '' };
}
export function validate(input, existing, selfId) {
    const plan = normalizePlan(input.plan);
    if (plan === '')
        return { code: 'plan-required' };
    if (!PLAN_PATTERN.test(plan))
        return { code: 'plan-invalid' };
    if (existing.some(one => one.plan === plan && one.id !== selfId))
        return { code: 'plan-duplicate', name: plan };
    if (normalizeName(input.name) === '')
        return { code: 'name-required' };
    const model = typeof input.embeddingModel === 'string' ? input.embeddingModel.trim() : '';
    if (model === '')
        return { code: 'embedding-required' };
    return undefined;
}
export class ConnectionStore {
    list() {
        migrateLegacyCards();
        return readRegistry().cards.map(entry => toRecord(entry)).filter((one) => one !== undefined);
    }
    get(id) { return this.list().find(one => one.id === id); }
    byPlan(plan) { return this.list().find(one => one.plan === normalizePlan(plan)); }
    create(input) {
        const plan = normalizePlan(input.plan);
        const registry = readRegistry();
        const address = typeof input.address === 'string' && input.address.trim() !== '' ? input.address.trim() : defaultAddress(plan);
        createCardDb(address);
        writeCard(address, {
            name: normalizeName(input.name),
            persona: typeof input.persona === 'string' ? input.persona : '',
        });
        registry.cards.push({
            plan,
            address,
            embeddingModel: typeof input.embeddingModel === 'string' ? input.embeddingModel.trim() : '',
            basePreset: typeof input.basePreset === 'string' ? input.basePreset : '',
            injectGroups: typeof input.injectGroups === 'number' && input.injectGroups > 0 ? Math.min(input.injectGroups, 100) : 10,
        });
        writeRegistry(registry);
        return toRecord(registry.cards[registry.cards.length - 1]);
    }
    update(id, input) {
        const registry = readRegistry();
        const entry = registry.cards.find(one => one.plan === normalizePlan(id));
        if (entry === undefined)
            return undefined;
        const plan = input.plan === undefined ? entry.plan : normalizePlan(input.plan);
        const moving = plan !== entry.plan;
        const address = moving ? defaultAddress(plan) : entry.address;
        // 改方案名时搬移数据库，而不是新建空库再删除旧库——否则会丢失全部记忆。
        if (moving && !existsSync(address) && existsSync(entry.address)) {
            mkdirSync(dirname(address), { recursive: true });
            try {
                renameSync(entry.address, address);
            }
            catch { /* 跨盘等失败时保留旧库，下面照常写新库 */ }
        }
        const current = readCard(address) ?? readCard(entry.address);
        writeCard(address, {
            name: input.name === undefined ? (current?.name ?? '') : normalizeName(input.name),
            persona: input.persona === undefined ? (current?.persona ?? '') : String(input.persona),
        });
        entry.plan = plan;
        entry.address = address;
        if (input.embeddingModel !== undefined)
            entry.embeddingModel = String(input.embeddingModel).trim();
        if (input.basePreset !== undefined)
            entry.basePreset = String(input.basePreset);
        if (typeof input.injectGroups === 'number' && input.injectGroups > 0)
            entry.injectGroups = Math.min(input.injectGroups, 100);
        writeRegistry(registry);
        return toRecord(entry);
    }
    remove(id) {
        const registry = readRegistry();
        const index = registry.cards.findIndex(one => one.plan === normalizePlan(id));
        if (index === -1)
            return false;
        const [entry] = registry.cards.splice(index, 1);
        if (entry !== undefined)
            rmSync(entry.address, { force: true });
        writeRegistry(registry);
        return true;
    }
}
//# sourceMappingURL=connections.js.map