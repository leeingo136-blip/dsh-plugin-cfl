/**
 * Client half: mount the knowledge remote contribution as early as the remote
 * carrier exists, so the knowledge settings sections (which inject
 * `remote.knowledge`) resolve it during their own activation. Splitting the
 * mount from the column mirrors the stock layout (account-hub-mount): the
 * remotes assembly mounts every namespace before the consuming UI plugins
 * activate.
 */
import knowledgeRemote from '@dsh/api-knowledge-book/remote'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'knowledge-mount'

/** Only the remote carrier itself; the namespace appears when the mount lands. */
export const inject = ['remote']

/** @param ctx - Client plugin context. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const disposer = ctx.remote.$mount(knowledgeRemote)
    return () => { void disposer.then(dispose => dispose()) }
  }, 'knowledge: remote contribution')
}
