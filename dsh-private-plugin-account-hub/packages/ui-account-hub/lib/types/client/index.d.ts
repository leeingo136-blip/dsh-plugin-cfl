/**
 * The settings account column: one section whose rows are contributed by
 * account plugins through the `account.hub.row` slot. The hub owns the
 * section shell, the account registry read (list + watch), and the row seat;
 * every row's content — status, sign-in affordance, balances — belongs to the
 * account plugin that registered under that id. Harness core hosts no account
 * product, so an empty registry renders the section's empty-state copy.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AccountHubCardDescriptor } from '@deepseek-ai/dsh-api-account-hub';
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client';
import { type AccountHubKey } from './locales.ts';
import { AccountHubSection, ProviderModelsCard } from './HubSection.tsx';
export { AccountHubSection, ProviderModelsCard };
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'settings.accountHub': AccountHubKey;
    }
    interface SlotMap {
        /**
         * One account plugin's row in the settings account column, keyed by the
         * account id from its hub registration. The owner supplies the account
         * identity, its latest published state, and the invoke seam; the content
         * component owns status rendering, sign-in affordances, and any balance
         * or usage detail it wants to show.
         */
        'account.hub.row': {
            kind: 'keyed';
            scope: 'root';
            owner: AccountHubRowOwnerProps;
        };
    }
}
/** Owner share of one account row (the section supplies nothing else). */
export interface AccountHubRowOwnerProps {
    /** Stable account id from the plugin's hub registration. */
    accountId: string;
    /** Display name from the plugin's hub registration. */
    displayName: string;
    /** Latest state the plugin published through the hub watch stream. */
    state: unknown;
    /** Forward one plugin-private operation through the hub. */
    invoke: (method: string, args: unknown) => Promise<unknown>;
}
/** The registry seam the section reads; closed over the plugin context. */
export interface AccountHubSectionFace {
    t: (key: AccountHubKey) => string;
    /** Snapshot of every registered account. */
    list: () => Promise<readonly AccountRow[]>;
    /** Subscribe to registry and state changes; returns the disposer. */
    subscribe: (onChange: () => void) => () => void;
    /** Forward one plugin-private operation. */
    invoke: (accountId: string, method: string, args: unknown) => Promise<unknown>;
    /** Read one account's stored (redacted) parameters from its namespace. */
    readParams: (accountId: string) => Promise<unknown>;
    /** Commit edited parameters into one account's settings namespace. */
    commitParams: (accountId: string, ops: SettingsPathOpView[]) => Promise<void>;
    /** Register the models-page provider-card entry for one account namespace
     *  (idempotent per namespace; the seat renders nothing unless the account
     *  opted in through `modelsCard`). */
    ensureModelsCard: (settingsNs: string) => void;
}
/** One registered account as the section renders it. */
export interface AccountRow {
    id: string;
    displayName: string;
    settingsNs: string;
    /** Declarative card the hub renders when present. */
    card?: AccountHubCardDescriptor;
    /** Whether the hub also serves this account's models-page provider card. */
    modelsCard?: boolean;
    state: unknown;
}
/** @returns the localized display name for the section nav. */
export declare function sectionLabel(t: (key: AccountHubKey) => string): string;
/** Services required by the account column. `remote.accountHub` is NOT a
 * required inject: this plugin mounts its own remote contribution (below), so
 * requiring the namespace up front would deadlock the boot activation check —
 * the mount completes inside this plugin's apply, never before it. The face
 * methods await the mount promise instead. */
export declare const inject: string[];
/**
 * Register the account column. Both renderers run this: the Desktop shell and
 * the Browser settings panel render the same `settings.section` seat, and the
 * hub's registry read and invoke seam are both served by the host rather than
 * by a surface-specific bridge. @param ctx - client plugin context.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map