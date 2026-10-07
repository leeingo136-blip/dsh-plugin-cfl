var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
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
import { Service } from '@deepseek-ai/cordis';
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
/** Cordis event an account plugin emits after its published state changes. */
export const ACCOUNT_HUB_CHANGED = 'account-hub/changed';
/**
 * Registry of installed account plugins. Plugins register during their own
 * `apply` and dispose with their fiber; the browser only ever talks to this
 * registry, never to a plugin's own remote face.
 */
/** The account the column pins to the top when it is installed. */
const PINNED_ACCOUNT = 'deepseek-account-external';
/** Column rank: pinned account first, every other account keeps its
 *  registration order (stable sort). */
function rank(id) {
    return id === PINNED_ACCOUNT ? 0 : 1;
}
export class AccountHub extends Service {
    accounts = new Map();
    constructor(ctx) {
        super(ctx, 'accountHub');
    }
    /** Register one account plugin; a duplicate id replaces the earlier entry. */
    register(registration) {
        if (registration.workMode !== 'credential-inject' && registration.workMode !== 'direct') {
            throw new Error(`account "${registration.id}" must declare workMode "credential-inject" or "direct"`
                + ` (got ${JSON.stringify(registration.workMode)})`);
        }
        console.log(`[account-hub] registered: ${registration.id}`
            + ` (displayName=${registration.displayName}, workMode=${registration.workMode})`);
        this.accounts.set(registration.id, registration);
        this.ctx.emit(ACCOUNT_HUB_CHANGED, registration.id);
        return () => {
            if (this.accounts.get(registration.id) === registration) {
                this.accounts.delete(registration.id);
                this.ctx.emit(ACCOUNT_HUB_CHANGED, registration.id);
            }
        };
    }
    /** The registration behind an account id, or a typed miss. */
    registration(id) {
        const registration = this.accounts.get(id);
        if (registration === undefined) {
            throw new RemoteError('account-hub/unknown-account', `no account plugin registered as "${id}"`, { id });
        }
        return registration;
    }
    /** Snapshot every registered account for the settings column, ordered: the
     *  DeepSeek account leads, the rest keep registration order. */
    list() {
        console.log(`[account-hub] list -> ${this.accounts.size} account(s)`);
        return [...this.accounts.values()]
            .toSorted((left, right) => rank(left.id) - rank(right.id))
            .map(({ id, displayName, settingsNs, workMode, card, modelsCard, getState }) => ({
            id, displayName, settingsNs, workMode,
            ...(card === undefined ? {} : { card }),
            ...(modelsCard === true ? { modelsCard: true } : {}),
            ...(getState === undefined ? {} : { state: getState() }),
        }));
    }
}
/**
 * Host service backing the generated `ctx.remote.accountHub` namespace. The
 * hub is the single browser-facing seam of every account plugin: listing and
 * watching goes through here, operations forward by account id, and provider
 * parameters land in the namespace the plugin declared at registration.
 */
let AccountHubController = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    let _invoke_decorators;
    let _commitParams_decorators;
    let _readParams_decorators;
    let _watch_decorators;
    return class AccountHubController extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _list_decorators = [Remote];
            _invoke_decorators = [Remote];
            _commitParams_decorators = [Remote];
            _readParams_decorators = [Remote];
            _watch_decorators = [Remote({ mode: 'stream' })];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _invoke_decorators, { kind: "method", name: "invoke", static: false, private: false, access: { has: obj => "invoke" in obj, get: obj => obj.invoke }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _commitParams_decorators, { kind: "method", name: "commitParams", static: false, private: false, access: { has: obj => "commitParams" in obj, get: obj => obj.commitParams }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _readParams_decorators, { kind: "method", name: "readParams", static: false, private: false, access: { has: obj => "readParams" in obj, get: obj => obj.readParams }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _watch_decorators, { kind: "method", name: "watch", static: false, private: false, access: { has: obj => "watch" in obj, get: obj => obj.watch }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        constructor(ctx) {
            // Distinct service key from the `accountHub` registry service; the wire
            // namespace stays `accountHub` (the accountController/settingsController pattern).
            super(ctx, 'accountHubController', { namespace: 'accountHub' });
            __runInitializers(this, _instanceExtraInitializers);
        }
        hub() {
            const hub = this.ctx.get('accountHub');
            if (hub === undefined) {
                throw new RemoteError('account-hub/unavailable', 'the account hub is not mounted', {});
            }
            return hub;
        }
        /** List every registered account for the settings account column. */
        async list() {
            return this.hub().list();
        }
        /**
         * Forward one account operation to its plugin. Method names and payloads
         * are plugin-private; failures keep the plugin's own error message.
         */
        async invoke(accountId, method, args) {
            const registration = this.hub().registration(accountId);
            try {
                return await registration.invoke(method, args);
            }
            catch (error) {
                throw new RemoteError('account-hub/invoke-failed', error instanceof Error ? error.message : String(error), { accountId, method });
            }
        }
        /**
         * Write provider parameters an account plugin collected in its settings
         * card into the namespace it declared at registration. The plugin owns the
         * shape; the hub only addresses the write, so the browser never needs a
         * settings namespace of its own for an external account.
         */
        async commitParams(accountId, ops) {
            const registration = this.hub().registration(accountId);
            const settings = this.ctx.get('settings');
            if (settings === undefined) {
                throw new RemoteError('account-hub/settings-unavailable', 'settings are unavailable', { accountId });
            }
            try {
                await settings.mutate(registration.settingsNs, ops);
            }
            catch (error) {
                throw new RemoteError('account-hub/commit-failed', error instanceof Error ? error.message : String(error), { accountId });
            }
        }
        /**
         * Read the account's stored provider parameters from its settings
         * namespace so the hub-rendered card can show current values. Secret
         * fields come back redacted exactly as the settings service redacts them,
         * so a password input starts empty rather than echoing the stored value.
         * @returns the namespace's layered value as a JSON-safe object; empty when
         *   the plugin has not registered its settings namespace.
         */
        async readParams(accountId) {
            const registration = this.hub().registration(accountId);
            const settings = this.ctx.get('settings');
            if (settings === undefined) {
                throw new RemoteError('account-hub/settings-unavailable', 'settings are unavailable', { accountId });
            }
            const descriptor = settings
                .describe({ redactSecrets: true })
                .find((row) => row.ns === registration.settingsNs);
            return (descriptor?.value ?? {});
        }
        /**
         * Stream account state changes: one initial snapshot per account, then an
         * emission whenever a plugin publishes new state.
         */
        async *watch(signal) {
            if (signal === undefined)
                return;
            const hub = this.hub();
            const snapshot = () => hub.list().map(({ id, state }) => state === undefined ? { id } : { id, state });
            for (const change of snapshot())
                yield change;
            const pending = [];
            let wake;
            const stop = this.ctx.on(ACCOUNT_HUB_CHANGED, (id) => {
                pending.push(id);
                wake?.();
            });
            try {
                while (!signal.aborted) {
                    if (pending.length === 0) {
                        await new Promise((resolve) => {
                            wake = resolve;
                            signal.addEventListener('abort', () => resolve(), { once: true });
                        });
                        wake = undefined;
                        if (signal.aborted)
                            return;
                    }
                    while (pending.length > 0) {
                        const id = pending.shift();
                        if (id === undefined)
                            continue;
                        const view = hub.list().find(entry => entry.id === id);
                        if (view !== undefined) {
                            yield view.state === undefined ? { id } : { id, state: view.state };
                        }
                    }
                }
            }
            finally {
                stop();
            }
        }
    };
})();
export { AccountHubController };
/** Harness-side plugin: mount the registry and its remote face. */
export const name = 'account-hub';
export function apply(ctx) {
    ctx.plugin(AccountHub);
    ctx.plugin(AccountHubController);
}
//# sourceMappingURL=index.js.map