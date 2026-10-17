import knowledgeRemote from '@dsh/api-knowledge-book/remote';
import { zh, en } from "./locales.js";
import { SkillsSection } from "./SkillsSection.js";
import { KnowledgeSection } from "./KnowledgeSection.js";
const NS = 'settings.knowledge';
export const inject = ['slots', 'locale', 'remote', 'theme'];
/** Unwrap the remote envelope; failures surface as rejections with the message. */
async function unwrap(promise) {
    const result = await promise;
    if (result.ok)
        return result.value;
    throw new Error(result.error.message);
}
export async function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-knowledge-book: copy dictionaries');
    await ctx.remote.$mount(knowledgeRemote);
    const knowledge = ctx.remote.knowledge;
    const t = ctx.locale.bind(NS);
    const skillsFace = {
        t,
        listSkills: () => unwrap(knowledge.skillList()),
        listSources: () => unwrap(knowledge.skillSources()),
        readSkill: (name, sourceId) => unwrap(knowledge.skillRead({ name, sourceId })),
        saveSkill: request => unwrap(knowledge.skillSave(request)),
        deleteSkill: async (name, sourceId) => { await unwrap(knowledge.skillDelete({ name, sourceId })); },
    };
    const ragFace = {
        t,
        list: () => unwrap(knowledge.ragList()),
        create: (name, description) => unwrap(knowledge.ragCreate({ name, description })),
        remove: async (id) => { await unwrap(knowledge.ragDelete({ id })); },
        ingest: (id, texts) => unwrap(knowledge.ragIngest({ id, texts: [...texts] })),
        query: (id, text, k) => unwrap(knowledge.ragQuery({ id, text, k })),
    };
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'knowledge-skills',
        order: 25,
        label: () => t('navSkills'),
        inject: () => ({ face: skillsFace }),
    }, SkillsSection));
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'knowledge-rag',
        order: 26,
        label: () => t('navRag'),
        inject: () => ({ face: ragFace }),
    }, KnowledgeSection));
}
//# sourceMappingURL=index.js.map