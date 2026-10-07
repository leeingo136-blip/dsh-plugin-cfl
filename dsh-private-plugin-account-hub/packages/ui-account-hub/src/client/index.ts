/**
 * The settings account column: one section whose rows are contributed by
 * account plugins through the `account.hub.row` slot. The hub owns the
 * section shell, the account registry read (list + watch), and the row seat;
 * every row's content — status, sign-in affordance, balances — belongs to the
 * account plugin that registered under that id. Harness core hosts no account
 * product, so an empty registry renders the section's empty-state copy.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { AccountHubCardDescriptor } from '@deepseek-ai/dsh-api-account-hub'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import accountHubRemote from '@deepseek-ai/dsh-api-account-hub/remote'
import { en, zh, type AccountHubKey } from './locales.ts'
import { AccountHubSection, ProviderModelsCard } from './HubSection.tsx'

export { AccountHubSection, ProviderModelsCard }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'settings.accountHub': AccountHubKey }
  interface SlotMap {
    /**
     * One account plugin's row in the settings account column, keyed by the
     * account id from its hub registration. The owner supplies the account
     * identity, its latest published state, and the invoke seam; the content
     * component owns status rendering, sign-in affordances, and any balance
     * or usage detail it wants to show.
     */
    'account.hub.row': { kind: 'keyed'; scope: 'root'; owner: AccountHubRowOwnerProps }
  }
}

/** Owner share of one account row (the section supplies nothing else). */
export interface AccountHubRowOwnerProps {
  /** Stable account id from the plugin's hub registration. */
  accountId: string
  /** Display name from the plugin's hub registration. */
  displayName: string
  /** Latest state the plugin published through the hub watch stream. */
  state: unknown
  /** Forward one plugin-private operation through the hub. */
  invoke: (method: string, args: unknown) => Promise<unknown>
}

/** The registry seam the section reads; closed over the plugin context. */
export interface AccountHubSectionFace {
  t: (key: AccountHubKey) => string
  /** Snapshot of every registered account. */
  list: () => Promise<readonly AccountRow[]>
  /** Subscribe to registry and state changes; returns the disposer. */
  subscribe: (onChange: () => void) => () => void
  /** Forward one plugin-private operation. */
  invoke: (accountId: string, method: string, args: unknown) => Promise<unknown>
  /** Read one account's stored (redacted) parameters from its namespace. */
  readParams: (accountId: string) => Promise<unknown>
  /** Commit edited parameters into one account's settings namespace. */
  commitParams: (accountId: string, ops: SettingsPathOpView[]) => Promise<void>
  /** Register the models-page provider-card entry for one account namespace
   *  (idempotent per namespace; the seat renders nothing unless the account
   *  opted in through `modelsCard`). */
  ensureModelsCard: (settingsNs: string) => void
}

/** One registered account as the section renders it. */
export interface AccountRow {
  id: string
  displayName: string
  settingsNs: string
  /** Declarative card the hub renders when present. */
  card?: AccountHubCardDescriptor
  /** Whether the hub also serves this account's models-page provider card. */
  modelsCard?: boolean
  state: unknown
}

/** @returns the localized display name for the section nav. */
export function sectionLabel(t: (key: AccountHubKey) => string): string {
  return t('nav')
}

/** Services required by the account column. `remote.accountHub` is NOT a
 * required inject: this plugin mounts its own remote contribution (below), so
 * requiring the namespace up front would deadlock the boot activation check —
 * the mount completes inside this plugin's apply, never before it. The face
 * methods await the mount promise instead. */
export const inject = ['slots', 'locale', 'remote', 'theme']

/**
 * Register the account column. Both renderers run this: the Desktop shell and
 * the Browser settings panel render the same `settings.section` seat, and the
 * hub's registry read and invoke seam are both served by the host rather than
 * by a surface-specific bridge. @param ctx - client plugin context.
 */
export function apply(ctx: Context): void {
  // The hub remote no longer rides the official remotes assembly: this plugin
  // mounts its own contribution so `ctx.remote.accountHub` exists client-side.
  // The face methods await `mounted` before their first namespace access —
  // slot dispatches happen on user interaction, long after activation.
  let mounted: Promise<void> = Promise.resolve()
  ctx.effect(() => {
    const disposer = ctx.remote.$mount(accountHubRemote)
    mounted = disposer.then(() => {})
    return () => { void disposer.then(dispose => dispose()) }
  }, 'accountHub: remote contribution')
  ctx.effect(() => ctx.locale.register('settings.accountHub', { en, zh }), 'accountHub: dictionaries')
  const t = ctx.locale.bind('settings.accountHub')
  const face: AccountHubSectionFace = {
    t,
    list: async () => {
      await mounted
      const result = await ctx.remote.accountHub.list()
      if (!result.ok) throw new Error(result.error.message)
      // The view already carries each account's latest published state — the
      // card's status line, signed-in flag, and identity/balance facts.
      return result.value.map(view => ({ ...view, state: view.state as unknown }))
    },
    subscribe: (onChange) => {
      // The stream opens asynchronously after the mount completes, so a
      // dispose before that just cancels the open.
      let stream: AsyncIterable<{ accept(): void }> & { dispose(): Promise<void> | void } | undefined
      let disposed = false
      void (async () => {
        await mounted
        if (disposed) return
        stream = ctx.remote.$stream<{ id: string; state?: unknown }>({
          name: 'accountHub', open: signal => ctx.remote.accountHub.watch(signal),
          ended: () => new Error('account hub stream ended'),
        })
        for await (const frame of stream) {
          frame.accept()
          onChange()
        }
      })()
      return () => { disposed = true; void stream?.dispose() }
    },
    invoke: async (accountId, method, args) => {
      await mounted
      const result = await ctx.remote.accountHub.invoke(accountId, method, args as JsonValue)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    readParams: async (accountId) => {
      await mounted
      const result = await ctx.remote.accountHub.readParams(accountId)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    commitParams: async (accountId, ops) => {
      await mounted
      const result = await ctx.remote.accountHub.commitParams(accountId, ops)
      if (!result.ok) throw new Error(result.error.message)
    },
    ensureModelsCard: (settingsNs) => {
      if (modelCardEntries.has(settingsNs)) return
      const dispose = ctx.slots.register({
        name: 'settings.models.provider-card',
        key: settingsNs,
        locale: 'settings.accountHub',
        inject: () => ({ face }),
      }, ProviderModelsCard)
      modelCardEntries.set(settingsNs, dispose)
    },
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'account', order: -10, label: () => t('nav'),
    locale: 'settings.accountHub',
    children: { 'account.hub.row': { kind: 'keyed', scope: 'root' } },
    inject: () => ({ face }),
  }, AccountHubSection))
  // The models page's `settings.models.provider-card` seat: one keyed entry
  // per opted-in account namespace (`ensureModelsCard`, called by the section
  // as accounts come and go). Accounts whose models page belongs to another
  // editor never opt in, so their rows stay exactly as they were.
  const modelCardEntries = new Map<string, () => void>()
  ctx.effect(() => () => {
    for (const dispose of modelCardEntries.values()) dispose()
  }, 'accountHub: models-card entries')
}
