/** Bounded, memory-only revocation of a token already removed from local credentials (ported). */
import { setTimeout } from 'node:timers/promises'
import { logoutAccount } from './protocol.ts'

/** Resolved logout retry settings owned by the account provider. */
export interface LogoutRetryPolicy {
  readonly maxRetries: number
  readonly delayMs: number
  readonly requestTimeoutMs: number
}

/**
 * Revoke one captured grant without changing local account state.
 * @param origin - issuer verified before local grant removal.
 * @param token - removed grant, never replaced with a later login's token.
 * @param policy - request deadline and exponential retry limits.
 * @param signal - provider lifetime; shutdown aborts requests and delays.
 * @returns after success, exhaustion, or cancellation; remote failures stay in the background.
 */
export async function revokeAccount(origin: string, token: string, policy: LogoutRetryPolicy,
  signal: AbortSignal): Promise<void> {
  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    if (signal.aborted) return
    if (attempt > 0) {
      try { await setTimeout(policy.delayMs * 2 ** (attempt - 1), undefined, { signal, ref: false }) }
      catch { return } // The validated delay rejects only when the provider lifetime ends.
    }
    try {
      await logoutAccount(origin, token, AbortSignal.any([signal, AbortSignal.timeout(policy.requestTimeoutMs)]))
      return
    } catch {
      // HTTP, business, and transport failures consume one attempt without restoring credentials.
    }
  }
}
