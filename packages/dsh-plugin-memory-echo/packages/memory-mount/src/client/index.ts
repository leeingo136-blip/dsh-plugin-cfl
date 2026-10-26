/**
 * Client half: mount the library remote contribution as early as the remote
 * carrier exists, so the library settings section (which injects
 * `remote.memory-echo`) resolves it during its own activation. Splitting the
 * mount from the column mirrors the stock layout (account-hub-mount): the
 * remotes assembly mounts every namespace before the consuming UI plugins
 * activate.
 */
import memoryRemote from '../../../memory-api/lib/typert.remote-client.js'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'memory-mount'

/** Only the remote carrier itself; the namespace appears when the mount lands. */
export const inject = ['remote']

/** @param ctx - Client plugin context. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const disposer = ctx.remote.$mount(memoryRemote)
    return () => { void disposer.then(dispose => dispose()) }
  }, 'memory-mount: remote contribution')
}
