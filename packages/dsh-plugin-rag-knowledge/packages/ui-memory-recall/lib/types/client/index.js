import { zh, en } from "./locales.js";
import { MemorySection } from "./MemorySection.js";
const NS = 'settings.rag-knowledge';
export const inject = ['slots', 'locale', 'remote', 'remote.rag-knowledge', 'theme'];
/** Unwrap the remote envelope; failures surface as rejections with the message. */
async function unwrap(promise) {
    const result = await promise;
    if (result.ok)
        return result.value;
    throw new Error(result.error.message);
}
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-rag-knowledge: copy dictionaries');
    const memory = ctx.remote['rag-knowledge'];
    const t = ctx.locale.bind(NS);
    const face = {
        t,
        list: () => unwrap(memory.connList()),
        create: input => unwrap(memory.connCreate(input)),
        update: input => unwrap(memory.connUpdate(input)),
        remove: async (id) => { await unwrap(memory.connDelete({ id })); },
        embeddingModels: () => unwrap(memory.embeddingModels()),
        docs: input => unwrap(memory.connDocs(input)),
        query: input => unwrap(memory.connQuery(input)),
    };
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'rag-knowledge',
        order: 26,
        label: () => t('navMemoryRecall'),
        inject: () => ({ face }),
    }, MemorySection));
}
//# sourceMappingURL=index.js.map