/**
 * Client half: mount the library remote contribution as early as the remote
 * carrier exists, so the library settings section (which injects
 * `remote.library`) resolves it during its own activation. Splitting the
 * mount from the column mirrors the stock layout (account-hub-mount): the
 * remotes assembly mounts every namespace before the consuming UI plugins
 * activate.
 */
import libraryRemote from '../../../library-api/lib/typert.remote-client.js';
export const name = 'library-mount';
/** Only the remote carrier itself; the namespace appears when the mount lands. */
export const inject = ['remote'];
/** @param ctx - Client plugin context. */
export function apply(ctx) {
    ctx.effect(() => {
        const disposer = ctx.remote.$mount(libraryRemote);
        return () => { void disposer.then(dispose => dispose()); };
    }, 'library-mount: remote contribution');
}
//# sourceMappingURL=index.js.map