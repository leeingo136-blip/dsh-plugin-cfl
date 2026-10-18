/**
 * Skill Book settings client: registers the 技能 settings section (skill
 * manager). The `skill-book` remote namespace is mounted by the sibling
 * `skill-mount` client plugin; injecting `remote.skill-book` parks this
 * plugin's activation on the namespace service, mirroring the account column
 * (`remote.accountHub`).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type SkillBookKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'settings.skill-book': SkillBookKey;
    }
}
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map