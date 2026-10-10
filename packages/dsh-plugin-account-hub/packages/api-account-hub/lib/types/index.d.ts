/**
 * dsh-account-hub — the in-host manager for optional account plugins.
 *
 * Harness core owns no account product. Account plugins (DeepSeek and later
 * third-party accounts) install as external bundles and register here; the hub
 * is the only piece that reaches the browser: it owns the settings account
 * column, forwards plugin operations through one remote namespace, and writes
 * provider parameters the plugins collect into the settings namespaces they
 * declare. The hub never learns any plugin's credential semantics.
 */
import { Context, Service } from '@deepseek-ai/cordis';
import type { SettingsPathOpView } from '@deepseek-ai/dsh-settings/types';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { JsonValue } from '@deepseek-ai/dsh-util-values';
import type { AccountHubAccountView, AccountHubCardDescriptor, AccountHubCardState, AccountHubChange, AccountHubFieldDescriptor, AccountHubFieldKind, AccountHubRegistration, AccountHubSelectOption, AccountHubWorkMode } from './types.ts';
export type { AccountHubAccountView, AccountHubCardDescriptor, AccountHubCardState, AccountHubChange, AccountHubFieldDescriptor, AccountHubFieldKind, AccountHubRegistration, AccountHubSelectOption, AccountHubWorkMode, };
/** Cordis event an account plugin emits after its published state changes. */
export declare const ACCOUNT_HUB_CHANGED = "account-hub/changed";
declare module '@deepseek-ai/cordis' {
    interface Events {
        'account-hub/changed'(id: string): void;
    }
    interface Context {
        accountHub: AccountHub;
    }
}
export declare class AccountHub extends Service {
    private readonly accounts;
    constructor(ctx: Context);
    /** Register one account plugin; a duplicate id replaces the earlier entry. */
    register(registration: AccountHubRegistration): () => void;
    /** The registration behind an account id, or a typed miss. */
    registration(id: string): AccountHubRegistration;
    /** Snapshot every registered account for the settings column, ordered: the
     *  DeepSeek account leads, the rest keep registration order. */
    list(): AccountHubAccountView[];
}
/**
 * Host service backing the generated `ctx.remote.accountHub` namespace. The
 * hub is the single browser-facing seam of every account plugin: listing and
 * watching goes through here, operations forward by account id, and provider
 * parameters land in the namespace the plugin declared at registration.
 */
export declare class AccountHubController extends TypertRemoteService {
    constructor(ctx: Context);
    private hub;
    /** List every registered account for the settings account column. */
    list(): Promise<AccountHubAccountView[]>;
    /**
     * Forward one account operation to its plugin. Method names and payloads
     * are plugin-private; failures keep the plugin's own error message.
     */
    invoke(accountId: string, method: string, args: JsonValue): Promise<JsonValue>;
    /**
     * Write provider parameters an account plugin collected in its settings
     * card into the namespace it declared at registration. The plugin owns the
     * shape; the hub only addresses the write, so the browser never needs a
     * settings namespace of its own for an external account.
     */
    commitParams(accountId: string, ops: SettingsPathOpView[]): Promise<void>;
    /**
     * Read the account's stored provider parameters from its settings
     * namespace so the hub-rendered card can show current values. Secret
     * fields come back redacted exactly as the settings service redacts them,
     * so a password input starts empty rather than echoing the stored value.
     * @returns the namespace's layered value as a JSON-safe object; empty when
     *   the plugin has not registered its settings namespace.
     */
    readParams(accountId: string): Promise<JsonValue>;
    /**
     * Stream account state changes: one initial snapshot per account, then an
     * emission whenever a plugin publishes new state.
     */
    watch(signal?: AbortSignal): AsyncIterable<AccountHubChange>;
}
/** Harness-side plugin: mount the registry and its remote face. */
export declare const name = "account-hub";
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map