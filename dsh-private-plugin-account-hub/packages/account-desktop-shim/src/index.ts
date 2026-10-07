/**
 * Desktop-shell `account` namespace compatibility shim.
 *
 * Why this exists: the stock desktop shell (apps/desktop, Electron main) runs
 * `readWelcomeState()` unconditionally at boot (`openInitialWindow`), and the
 * original `welcome-backend.read()` ends with
 * `loggedIn: (await account.state()).status === 'credential-stored'` plus the
 * `needsWelcome({ loggedIn, hasApiKey })` decision that opens the native
 * welcome/sign-in window. The private harness deleted that whole flow
 * (welcome-window.ts / welcome-api.ts removed, `openInitialWindow` goes
 * straight to `enterWorkspace`), but an external plugin cannot patch the
 * Electron main process. On the stock app the container therefore disables the
 * built-in account product rows (`account-controller` provided the `account`
 * namespace), and without a replacement the boot RPC 404s and the app crashes
 * with "desktop welcome: Web request failed".
 *
 * This entry re-provides the `account` namespace as a static shim so the
 * native path answers and `needsWelcome` stays false — the same observable
 * outcome as the private harness: the app boots directly into the workspace
 * and the welcome/sign-in window never appears. The shim is intentionally a
 * stub: DeepSeek sign-in lives in the settings account column rendered by the
 * account hub, and the web UI never touches this namespace.
 *
 * Honest-usage notes (mirrors the fork's semantics):
 * - `getState` reports a fixed `credential-stored` view with attempt `null`,
 *   so the shell's account watch never triggers welcome re-open or
 *   post-sign-in workspace entry — both already handled by the workspace
 *   being open.
 * - `startSignIn` / `cancelSignIn` / `signOut` are no-ops that return the same
 *   view: native sign-in affordances (if any remain in menus) do nothing
 *   instead of erroring.
 * - profile / balance / bonuses reads return `null`, the wire shape for
 *   "no account grant", and expiry streams stay silent.
 *
 * Method signatures intentionally mirror `packages/api/account-controller`
 * one for one: the gateway dispatches in SRC mode, deriving wire parameter
 * names from the implementation's parameter names, so the stock desktop
 * caller's argument objects bind by name.
 */
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

console.log('[account-desktop-shim] module loaded from', import.meta.url)

/** The safe account projection the desktop shell validates client-side. */
interface AccountView {
  status: 'credential-stored'
  links: { usageUrl: string; topUpUrl: string }
  attempt: null
}

/** Display-safe client identity the shell attaches to account reads. */
interface AccountClientMetadata {
  version: string
  locale: string
  timezoneOffsetSeconds: number
}

/** The one view this shim always answers with: signed in, no pending attempt. */
const STATIC_VIEW: AccountView = {
  status: 'credential-stored',
  links: {
    usageUrl: 'https://platform.deepseek.com/usage',
    topUpUrl: 'https://platform.deepseek.com/top_up',
  },
  attempt: null,
}

const view = (): AccountView => ({ ...STATIC_VIEW, links: { ...STATIC_VIEW.links } })

/** Settle when the stream carrier cancels, keeping the stream open otherwise. */
const idle = (signal: AbortSignal): Promise<void> => new Promise((resolve) => {
  if (signal.aborted) resolve()
  else signal.addEventListener('abort', () => resolve(), { once: true })
})

/**
 * The shim service. Providing it under its own key with the `account`
 * namespace binding lets the stock gateway's SRC discovery route the desktop
 * shell's account RPCs here without any generated artifacts.
 */
export default class AccountDesktopShim extends TypertRemoteService {
  /** @param ctx - host context. */
  constructor(ctx: Context) {
    super(ctx, 'accountDesktopShim', { namespace: 'account' })
    console.log('[account-desktop-shim] namespace "account" mounted: welcome/readWelcomeState compatibility active')
  }

  /** Fixed signed-in view; keeps `needsWelcome` false so the welcome window never opens. */
  @Remote
  getState(): Promise<AccountView> { return Promise.resolve(view()) }

  /** No account grant behind the shim: reads answer the null outcome. */
  @Remote
  getProfile(_client: AccountClientMetadata): Promise<null> { return Promise.resolve(null) }

  /** No account grant behind the shim: reads answer the null outcome. */
  @Remote
  getBalance(_client: AccountClientMetadata): Promise<null> { return Promise.resolve(null) }

  /** No account grant behind the shim: reads answer the null outcome. */
  @Remote
  getUnnotifiedBonuses(_client: AccountClientMetadata): Promise<null> { return Promise.resolve(null) }

  /** Nothing was ever notified: acknowledge trivially. */
  @Remote
  ackBonusNotified(_accountId: string, _orderId: string, _client: AccountClientMetadata): Promise<boolean> {
    return Promise.resolve(true)
  }

  /** Native sign-in is retired with the welcome window: no-op, same view. */
  @Remote
  startSignIn(_client: AccountClientMetadata, _callbackOrigin: string, _loginSource: 'web' | 'desktop'): Promise<AccountView> {
    return Promise.resolve(view())
  }

  /** No attempt can exist: settle immediately. */
  @Remote
  cancelSignIn(_attemptId: string): Promise<AccountView> { return Promise.resolve(view()) }

  /** No running account tasks: the account inference route is the external plugin's own. */
  @Remote
  hasRunningAccountTasks(): boolean { return false }

  /** Native sign-out is retired with the welcome window: no-op, same view. */
  @Remote
  signOut(_client: AccountClientMetadata): Promise<AccountView> { return Promise.resolve(view()) }

  /** Expiry never fires behind the static view; the stream stays open until cancelled. */
  @Remote({ mode: 'stream' })
  async *watchExpiry(signal: AbortSignal): AsyncIterable<'session-expired'> {
    await idle(signal)
  }

  /** One snapshot then silence: the shell's watch needs an open, valid stream. */
  @Remote({ mode: 'stream' })
  async *watch(signal: AbortSignal): AsyncIterable<AccountView> {
    yield view()
    await idle(signal)
  }
}
