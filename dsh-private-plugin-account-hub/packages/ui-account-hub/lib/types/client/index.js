import accountHubRemote from '@deepseek-ai/dsh-api-account-hub/remote';
import { en, zh } from "./locales.js";
import { AccountHubSection, ProviderModelsCard } from "./HubSection.js";
export { AccountHubSection, ProviderModelsCard };
/** @returns the localized display name for the section nav. */
export function sectionLabel(t) {
    return t('nav');
}
/** Services required by the account column. `remote.accountHub` is NOT a
 * required inject: this plugin mounts its own remote contribution (below), so
 * requiring the namespace up front would deadlock the boot activation check —
 * the mount completes inside this plugin's apply, never before it. The face
 * methods await the mount promise instead. */
export const inject = ['slots', 'locale', 'remote', 'theme'];
/**
 * Register the account column. Both renderers run this: the Desktop shell and
 * the Browser settings panel render the same `settings.section` seat, and the
 * hub's registry read and invoke seam are both served by the host rather than
 * by a surface-specific bridge. @param ctx - client plugin context.
 */
export function apply(ctx) {
    // The hub remote no longer rides the official remotes assembly: this plugin
    // mounts its own contribution so `ctx.remote.accountHub` exists client-side.
    // The face methods await `mounted` before their first namespace access —
    // slot dispatches happen on user interaction, long after activation.
    let mounted = Promise.resolve();
    ctx.effect(() => {
        const disposer = ctx.remote.$mount(accountHubRemote);
        mounted = disposer.then(() => { });
        return () => { void disposer.then(dispose => dispose()); };
    }, 'accountHub: remote contribution');
    ctx.effect(() => ctx.locale.register('settings.accountHub', { en, zh }), 'accountHub: dictionaries');
    const t = ctx.locale.bind('settings.accountHub');
    const face = {
        t,
        list: async () => {
            await mounted;
            const result = await ctx.remote.accountHub.list();
            if (!result.ok)
                throw new Error(result.error.message);
            // The view already carries each account's latest published state — the
            // card's status line, signed-in flag, and identity/balance facts.
            return result.value.map(view => ({ ...view, state: view.state }));
        },
        subscribe: (onChange) => {
            // The stream opens asynchronously after the mount completes, so a
            // dispose before that just cancels the open.
            let stream;
            let disposed = false;
            void (async () => {
                await mounted;
                if (disposed)
                    return;
                stream = ctx.remote.$stream({
                    name: 'accountHub', open: signal => ctx.remote.accountHub.watch(signal),
                    ended: () => new Error('account hub stream ended'),
                });
                for await (const frame of stream) {
                    frame.accept();
                    onChange();
                }
            })();
            return () => { disposed = true; void stream?.dispose(); };
        },
        invoke: async (accountId, method, args) => {
            await mounted;
            const result = await ctx.remote.accountHub.invoke(accountId, method, args);
            if (!result.ok)
                throw new Error(result.error.message);
            return result.value;
        },
        readParams: async (accountId) => {
            await mounted;
            const result = await ctx.remote.accountHub.readParams(accountId);
            if (!result.ok)
                throw new Error(result.error.message);
            return result.value;
        },
        commitParams: async (accountId, ops) => {
            await mounted;
            const result = await ctx.remote.accountHub.commitParams(accountId, ops);
            if (!result.ok)
                throw new Error(result.error.message);
        },
        ensureModelsCard: (settingsNs) => {
            if (modelCardEntries.has(settingsNs))
                return;
            const dispose = ctx.slots.register({
                name: 'settings.models.provider-card',
                key: settingsNs,
                locale: 'settings.accountHub',
                inject: () => ({ face }),
            }, ProviderModelsCard);
            modelCardEntries.set(settingsNs, dispose);
        },
    };
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'account', order: -10, label: () => t('nav'),
        locale: 'settings.accountHub',
        children: { 'account.hub.row': { kind: 'keyed', scope: 'root' } },
        inject: () => ({ face }),
    }, AccountHubSection));
    // The models page's `settings.models.provider-card` seat: one keyed entry
    // per opted-in account namespace (`ensureModelsCard`, called by the section
    // as accounts come and go). Accounts whose models page belongs to another
    // editor never opt in, so their rows stay exactly as they were.
    const modelCardEntries = new Map();
    ctx.effect(() => () => {
        for (const dispose of modelCardEntries.values())
            dispose();
    }, 'accountHub: models-card entries');
}
//# sourceMappingURL=index.js.map