/**
 * Knowledge Book settings client: registers the two settings sections —
 * 技能 (skill manager) and 知识库 (local vector knowledge bases). The
 * `knowledge` remote namespace is mounted by the sibling `knowledge-mount`
 * client plugin; injecting `remote.knowledge` parks this plugin's activation
 * on the namespace service, mirroring the account column (`remote.accountHub`).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type KnowledgeKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'settings.knowledge': KnowledgeKey;
    }
}
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map