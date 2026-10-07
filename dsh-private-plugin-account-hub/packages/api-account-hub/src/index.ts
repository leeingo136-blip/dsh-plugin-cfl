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
import { Context, Service } from '@deepseek-ai/cordis'
import type { SettingsDescriptor } from '@deepseek-ai/dsh-settings'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-settings/types'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {
  AccountHubAccountView, AccountHubCardDescriptor, AccountHubCardState, AccountHubChange,
  AccountHubFieldDescriptor, AccountHubFieldKind, AccountHubRegistration,
  AccountHubSelectOption, AccountHubWorkMode,
} from './types.ts'

export type {
  AccountHubAccountView, AccountHubCardDescriptor, AccountHubCardState, AccountHubChange,
  AccountHubFieldDescriptor, AccountHubFieldKind, AccountHubRegistration,
  AccountHubSelectOption, AccountHubWorkMode,
}

/** Cordis event an account plugin emits after its published state changes. */
export const ACCOUNT_HUB_CHANGED = 'account-hub/changed'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'account-hub/changed'(id: string): void
  }
  interface Context {
    accountHub: AccountHub
  }
}

/**
 * Registry of installed account plugins. Plugins register during their own
 * `apply` and dispose with their fiber; the browser only ever talks to this
 * registry, never to a plugin's own remote face.
 */

/** The account the column pins to the top when it is installed. */
const PINNED_ACCOUNT = 'deepseek-account-external'

/** Column rank: pinned account first, every other account keeps its
 *  registration order (stable sort). */
function rank(id: string): number {
  return id === PINNED_ACCOUNT ? 0 : 1
}

export class AccountHub extends Service {
  private readonly accounts = new Map<string, AccountHubRegistration>()

  constructor(ctx: Context) {
    super(ctx, 'accountHub')
  }

  /** Register one account plugin; a duplicate id replaces the earlier entry. */
  register(registration: AccountHubRegistration): () => void {
    if (registration.workMode !== 'credential-inject' && registration.workMode !== 'direct') {
      throw new Error(
        `account "${registration.id}" must declare workMode "credential-inject" or "direct"`
          + ` (got ${JSON.stringify(registration.workMode)})`,
      )
    }
    console.log(`[account-hub] registered: ${registration.id}`
      + ` (displayName=${registration.displayName}, workMode=${registration.workMode})`)
    this.accounts.set(registration.id, registration)
    this.ctx.emit(ACCOUNT_HUB_CHANGED, registration.id)
    return () => {
      if (this.accounts.get(registration.id) === registration) {
        this.accounts.delete(registration.id)
        this.ctx.emit(ACCOUNT_HUB_CHANGED, registration.id)
      }
    }
  }

  /** The registration behind an account id, or a typed miss. */
  registration(id: string): AccountHubRegistration {
    const registration = this.accounts.get(id)
    if (registration === undefined) {
      throw new RemoteError('account-hub/unknown-account', `no account plugin registered as "${id}"`, { id })
    }
    return registration
  }

  /** Snapshot every registered account for the settings column, ordered: the
   *  DeepSeek account leads, the rest keep registration order. */
  list(): AccountHubAccountView[] {
    console.log(`[account-hub] list -> ${this.accounts.size} account(s)`)
    return [...this.accounts.values()]
      .toSorted((left, right) => rank(left.id) - rank(right.id))
      .map(({ id, displayName, settingsNs, workMode, card, modelsCard, getState }) => ({
        id, displayName, settingsNs, workMode,
        ...(card === undefined ? {} : { card }),
        ...(modelsCard === true ? { modelsCard: true } : {}),
        ...(getState === undefined ? {} : { state: getState() }),
      }))
  }
}

/**
 * Host service backing the generated `ctx.remote.accountHub` namespace. The
 * hub is the single browser-facing seam of every account plugin: listing and
 * watching goes through here, operations forward by account id, and provider
 * parameters land in the namespace the plugin declared at registration.
 */
export class AccountHubController extends TypertRemoteService {
  constructor(ctx: Context) {
    // Distinct service key from the `accountHub` registry service; the wire
    // namespace stays `accountHub` (the accountController/settingsController pattern).
    super(ctx, 'accountHubController', { namespace: 'accountHub' })
  }

  private hub(): AccountHub {
    const hub = this.ctx.get('accountHub')
    if (hub === undefined) {
      throw new RemoteError('account-hub/unavailable', 'the account hub is not mounted', {})
    }
    return hub
  }

  /** List every registered account for the settings account column. */
  @Remote
  async list(): Promise<AccountHubAccountView[]> {
    return this.hub().list()
  }

  /**
   * Forward one account operation to its plugin. Method names and payloads
   * are plugin-private; failures keep the plugin's own error message.
   */
  @Remote
  async invoke(accountId: string, method: string, args: JsonValue): Promise<JsonValue> {
    const registration = this.hub().registration(accountId)
    try {
      return await registration.invoke(method, args)
    } catch (error) {
      throw new RemoteError('account-hub/invoke-failed',
        error instanceof Error ? error.message : String(error), { accountId, method })
    }
  }

  /**
   * Write provider parameters an account plugin collected in its settings
   * card into the namespace it declared at registration. The plugin owns the
   * shape; the hub only addresses the write, so the browser never needs a
   * settings namespace of its own for an external account.
   */
  @Remote
  async commitParams(accountId: string, ops: SettingsPathOpView[]): Promise<void> {
    const registration = this.hub().registration(accountId)
    const settings = this.ctx.get('settings')
    if (settings === undefined) {
      throw new RemoteError('account-hub/settings-unavailable', 'settings are unavailable', { accountId })
    }
    try {
      await settings.mutate(registration.settingsNs, ops as never)
    } catch (error) {
      throw new RemoteError('account-hub/commit-failed',
        error instanceof Error ? error.message : String(error), { accountId })
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
  @Remote
  async readParams(accountId: string): Promise<JsonValue> {
    const registration = this.hub().registration(accountId)
    const settings = this.ctx.get('settings')
    if (settings === undefined) {
      throw new RemoteError('account-hub/settings-unavailable', 'settings are unavailable', { accountId })
    }
    const descriptor = settings
      .describe({ redactSecrets: true })
      .find((row: SettingsDescriptor) => row.ns === registration.settingsNs)
    return (descriptor?.value ?? {}) as JsonValue
  }

  /**
   * Stream account state changes: one initial snapshot per account, then an
   * emission whenever a plugin publishes new state.
   */
  @Remote({ mode: 'stream' })
  async *watch(signal?: AbortSignal): AsyncIterable<AccountHubChange> {
    if (signal === undefined) return
    const hub = this.hub()
    const snapshot = (): AccountHubChange[] => hub.list().map(
      ({ id, state }) => state === undefined ? { id } : { id, state },
    )
    for (const change of snapshot()) yield change
    const pending: string[] = []
    let wake: (() => void) | undefined
    const stop = this.ctx.on(ACCOUNT_HUB_CHANGED, (id) => {
      pending.push(id)
      wake?.()
    })
    try {
      while (!signal.aborted) {
        if (pending.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve
            signal.addEventListener('abort', () => resolve(), { once: true })
          })
          wake = undefined
          if (signal.aborted) return
        }
        while (pending.length > 0) {
          const id = pending.shift()
          if (id === undefined) continue
          const view = hub.list().find(entry => entry.id === id)
          if (view !== undefined) {
            yield view.state === undefined ? { id } : { id, state: view.state }
          }
        }
      }
    } finally {
      stop()
    }
  }
}

/** Harness-side plugin: mount the registry and its remote face. */
export const name = 'account-hub'

export function apply(ctx: Context): void {
  ctx.plugin(AccountHub)
  ctx.plugin(AccountHubController)
}
