/**
 * Memory-recall settings client: registers the 记忆回想 settings section
 * (RAG connection cards). The `rag-knowledge` remote namespace is mounted by
 * the sibling `memory-mount` client plugin; injecting `remote.rag-knowledge`
 * parks this plugin's activation on the namespace service, mirroring the
 * account column (`remote.accountHub`).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type MemoryKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'settings.rag-knowledge': MemoryKey;
    }
}
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map