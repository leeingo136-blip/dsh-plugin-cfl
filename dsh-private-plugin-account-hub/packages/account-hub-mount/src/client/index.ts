/**
 * Client half: mount the account-hub remote contribution as early as the
 * remote service exists, so plugins that inject `remote.accountHub` (the
 * account column) resolve it during their own activation. Splitting the
 * mount from the column mirrors the stock layout where the remotes assembly
 * mounts every namespace before the consuming UI plugins activate.
 */
import accountHubRemote from '@deepseek-ai/dsh-api-account-hub/remote'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'account-hub-mount'

/** Only the remote carrier itself; the namespace appears when the mount lands. */
export const inject = ['remote']

/** @param ctx - Client plugin context. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const disposer = ctx.remote.$mount(accountHubRemote)
    return () => { void disposer.then(dispose => dispose()) }
  }, 'accountHub: remote contribution')
}
