/**
 * Client half: mount the skill-book remote contribution as early as the
 * remote carrier exists, so the skill settings section (which injects
 * `remote.skill-book`) resolves it during its own activation. Splitting the
 * mount from the column mirrors the stock layout (account-hub-mount): the
 * remotes assembly mounts every namespace before the consuming UI plugins
 * activate.
 */
import skillBookRemote from '../../../skill-api/lib/typert.remote-client.js';
export const name = 'skill-mount';
/** Only the remote carrier itself; the namespace appears when the mount lands. */
export const inject = ['remote'];
/** @param ctx - Client plugin context. */
export function apply(ctx) {
    ctx.effect(() => {
        const disposer = ctx.remote.$mount(skillBookRemote);
        return () => { void disposer.then(dispose => dispose()); };
    }, 'skill-mount: remote contribution');
}
//# sourceMappingURL=index.js.map