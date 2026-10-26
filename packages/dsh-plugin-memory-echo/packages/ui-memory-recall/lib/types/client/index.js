import { zh, en } from "./locales.js";
import { MemorySection } from "./MemorySection.js";
const NS = 'settings.memory-echo';
export const inject = ['slots', 'locale', 'remote', 'remote.memory-echo', 'theme'];
/** Unwrap the remote envelope; failures surface as rejections with the message. */
async function unwrap(promise) {
    const result = await promise;
    if (result.ok)
        return result.value;
    throw new Error(result.error.message);
}
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-memory-echo: copy dictionaries');
    // `remote.memory-echo` is declared in `inject`, so reading it here is legal;
    // the mount publishes the namespace before this plugin activates.
    const memory = ctx.remote['memory-echo'];
    const t = ctx.locale.bind(NS);
    const face = {
        t,
        list: () => unwrap(memory.connList()),
        create: input => unwrap(memory.connCreate(input)),
        update: input => unwrap(memory.connUpdate(input)),
        remove: async (id) => { await unwrap(memory.connDelete({ id })); },
        embeddingModels: () => unwrap(memory.embeddingModels()),
        query: input => unwrap(memory.connQuery(input)),
        generatePresets: () => unwrap(memory.generatePresets()),
        workspaceOptions: () => unwrap(memory.workspaceOptions()),
        presetOptions: () => unwrap(memory.presetOptions()),
        createCharacterPreset: input => unwrap(memory.createCharacterPreset(input)),
        openDatabaseLocation: input => unwrap(memory.openDatabaseLocation(input)),
        cardState: input => unwrap(memory.cardState(input)),
        dreamList: input => unwrap(memory.dreamList(input)),
        setSelfState: input => unwrap(memory.setSelfState(input)),
        listEntities: input => unwrap(memory.listEntities(input)),
        saveEntity: input => unwrap(memory.saveEntity(input)),
        deleteEntity: input => unwrap(memory.deleteEntity(input)),
        listMemories: input => unwrap(memory.listMemories(input)),
        addMemory: input => unwrap(memory.addMemory(input)),
        deleteMemory: input => unwrap(memory.deleteMemory(input)),
        setEntityState: input => unwrap(memory.setEntityState(input)),
        databaseFiles: () => unwrap(memory.databaseFiles()),
        loadDatabase: input => unwrap(memory.loadDatabase(input)),
    };
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'memory-echo',
        order: 26,
        label: () => t('navMemoryRecall'),
        locale: NS,
        inject: () => ({ face }),
    }, MemorySection));
}
//# sourceMappingURL=index.js.map