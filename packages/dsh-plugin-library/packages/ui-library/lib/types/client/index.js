import { zh, en } from "./locales.js";
import { KnowledgeSection } from "./KnowledgeSection.js";
const NS = 'settings.library';
export const inject = ['slots', 'locale', 'remote', 'remote.library', 'theme'];
/** Unwrap the remote envelope; failures surface as rejections with the message. */
async function unwrap(promise) {
    const result = await promise;
    if (result.ok)
        return result.value;
    throw new Error(result.error.message);
}
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-library: copy dictionaries');
    const library = ctx.remote.library;
    const t = ctx.locale.bind(NS);
    const ragFace = {
        t,
        list: () => unwrap(library.ragList()),
        create: (name, description) => unwrap(library.ragCreate({ name, description })),
        remove: async (id) => { await unwrap(library.ragDelete({ id })); },
        ingest: (id, texts) => unwrap(library.ragIngest({ id, texts: [...texts] })),
        query: (id, text, k) => unwrap(library.ragQuery({ id, text, k })),
    };
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'library',
        order: 26,
        label: () => t('navLibrary'),
        inject: () => ({ face: ragFace }),
    }, KnowledgeSection));
}
//# sourceMappingURL=index.js.map