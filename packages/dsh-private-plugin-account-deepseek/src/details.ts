/** Platform Web profile queries projected for the hub account card (ported from dsh-account-platform). */
import { z } from 'zod'
import { PlatformAuthError, requestAccount } from './protocol.ts'

/** The profile facts the account card shows. */
export interface AccountProfile {
  id: string | null
  avatarUrl: string | null
  name: string | null
  contact: string | null
}

const user = z.object({
  id: z.string().nullish(),
  email: z.string(), mobile: z.string().optional(), mobile_number: z.string().optional(),
  id_profile: z.object({ name: z.string().nullable(), picture: z.string().nullish() }).nullish(),
})

/**
 * Project Platform user data without retaining credentials or unneeded fields.
 * @param value - current or exchange user response.
 * @returns UI account profile.
 */
export function profile(value: unknown): AccountProfile {
  const parsed = user.safeParse(value)
  if (!parsed.success) throw new PlatformAuthError('protocol')
  const { email, mobile, mobile_number: mobileNumber, id_profile: identity } = parsed.data
  return {
    id: parsed.data.id == null ? null : parsed.data.id,
    avatarUrl: identity?.picture || null,
    name: identity?.name || null, contact: mobile || mobileNumber || email || null,
  }
}

/**
 * Read the Platform profile for one stored credential.
 * @param origin - configured origin matching the stored grant issuer.
 * @param token - stored authorization token.
 * @param signal - request and credential lifetime.
 * @returns the ready profile.
 * @throws AccountUnauthorizedError when Platform rejects the stored token with HTTP 401 or code 40003.
 */
export async function readProfile(origin: string, token: string, signal: AbortSignal): Promise<AccountProfile> {
  return profile(await requestAccount(origin, '/auth-api/v0/users/current', token, signal))
}

/** One recharge wallet as the Platform reports it (decimal string amount). */
export interface Wallet {
  currency: 'CNY' | 'USD'
  balance: string
}

/** The recharge and bonus wallet lists of one account. */
export interface AccountWallets {
  normal: Wallet[]
  bonus: Wallet[]
}

// Balance and amount arrive as strings the Platform Web client passes to
// big.js, whose decimal grammar also accepts an omitted integer or fraction
// part and a decimal exponent (0E-16, 1e+3).
const decimal = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const wallet = z.object({ currency: z.enum(['CNY', 'USD']), balance: z.string().regex(decimal) })
const summary = z.object({ normal_wallets: z.array(wallet), bonus_wallets: z.array(wallet) })

/**
 * Read one account's recharge and bonus wallet balances.
 * @param origin - configured origin matching the stored grant issuer.
 * @param token - stored authorization token.
 * @param signal - request deadline.
 * @returns the wallet lists.
 * @throws AccountUnauthorizedError when Platform rejects the stored token.
 */
export async function readBalance(origin: string, token: string, signal: AbortSignal): Promise<AccountWallets> {
  const parsed = summary.safeParse(await requestAccount(origin, '/api/v0/users/get_user_summary', token, signal))
  if (!parsed.success) throw new PlatformAuthError('protocol')
  return { normal: parsed.data.normal_wallets, bonus: parsed.data.bonus_wallets }
}
