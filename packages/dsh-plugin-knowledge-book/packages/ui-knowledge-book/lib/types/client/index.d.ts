/**
 * Knowledge Book settings client: mounts the `knowledge` remote contribution,
 * then registers the two settings sections — 技能 (skill manager) and
 * 知识库 (local vector knowledge bases). The mount lands before the section
 * registration so a section's first render can call without waiting.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type KnowledgeKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'settings.knowledge': KnowledgeKey;
    }
}
export declare const inject: string[];
export declare function apply(ctx: ClientContext): Promise<void>;
//# sourceMappingURL=index.d.ts.map