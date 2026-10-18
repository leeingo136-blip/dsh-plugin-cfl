import { zh, en } from "./locales.js";
import { SkillsSection } from "./SkillsSection.js";
const NS = 'settings.skill-book';
export const inject = ['slots', 'locale', 'remote', 'remote.skill-book', 'theme'];
/** Unwrap the remote envelope; failures surface as rejections with the message. */
async function unwrap(promise) {
    const result = await promise;
    if (result.ok)
        return result.value;
    throw new Error(result.error.message);
}
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-skill-book: copy dictionaries');
    const skillBook = ctx.remote['skill-book'];
    const t = ctx.locale.bind(NS);
    const skillsFace = {
        t,
        listSkills: () => unwrap(skillBook.skillList()),
        listSources: () => unwrap(skillBook.skillSources()),
        readSkill: (name, sourceId) => unwrap(skillBook.skillRead({ name, sourceId })),
        saveSkill: request => unwrap(skillBook.skillSave(request)),
        deleteSkill: async (name, sourceId) => { await unwrap(skillBook.skillDelete({ name, sourceId })); },
    };
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'skill-book',
        order: 25,
        label: () => t('navSkills'),
        inject: () => ({ face: skillsFace }),
    }, SkillsSection));
}
//# sourceMappingURL=index.js.map