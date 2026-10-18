/**
 * Library settings client: registers the 图书馆 settings section (local
 * vector knowledge bases). The `library` remote namespace is mounted by the
 * sibling `library-mount` client plugin; injecting `remote.library` parks
 * this plugin's activation on the namespace service, mirroring the account
 * column (`remote.accountHub`).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type LibraryKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'settings.library': LibraryKey;
    }
}
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map