/**
 * The Codex OAuth / API-key protocol surface, ported from openai/codex
 * (Apache-2.0, `codex-rs/login`).
 *
 * Two login paths, exactly what `codex login` offers:
 *
 * - **ChatGPT subscription**: OAuth 2.0 authorization-code + PKCE against
 *   `auth.openai.com`. The CLI opens the authorize URL with a local callback
 *   server on `127.0.0.1:1455/auth/callback`; the exchange posts form-encoded
 *   parameters to `/oauth/token`; refresh posts a JSON body to the same URL
 *   (the two encodings mirror `TokenEncoding::Form` / `TokenEncoding::Json`
 *   in `codex-rs/login/src/{server,auth/manager}.rs`). The ChatGPT account id
 *   rides in the id token's `chatgpt_account_id` claim.
 * - **OpenAI Platform API key**: a plain key against the Responses API at
 *   `api.openai.com/v1`.
 *
 * @module codex-account/protocol
 */

import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { arch as osArch, platform as osPlatform, release as osRelease } from 'node:os'

/** The public Codex CLI OAuth client id (`codex-rs/login/src/auth/manager.rs`). */
export const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
/** The OAuth issuer (`codex-rs/login/src/server.rs` `DEFAULT_ISSUER`). */
export const ISSUER = 'https://auth.openai.com'
/** The authorize endpoint. */
export const AUTHORIZE_URL = `${ISSUER}/oauth/authorize`
/** The token endpoint (exchange + refresh). */
export const TOKEN_URL = `${ISSUER}/oauth/token`
/** Local callback the login server binds (`codex-rs/login/src/server.rs`). */
export const CALLBACK_PORT = 1455
export const CALLBACK_PATH = '/auth/callback'
/** Requested scopes (`build_authorize_url`). */
export const SCOPE = 'openid profile email offline_access api.connectors.read api.connectors.invoke'

/** The Codex CLI version this plugin's fingerprint mirrors (rust-v0.161.0). */
export const CODEX_VERSION = '0.161.0'

// ---- client fingerprint --------------------------------------------------------
// The backend attributes requests by their header fingerprint, so every
// outbound call carries the same shape the CLI itself sends:
// `codex_cli_rs/<version> (<os> <os-version>; <arch>) <terminal>` — the
// format of `get_codex_user_agent` in `codex-rs/core/src/default_client.rs`.

/** Darwin kernel major → macOS marketing version (24 → 15, 25 → 26, …). */
function darwinMarketingRelease(): string {
  const parts = osRelease().split('.')
  const major = Number.parseInt(parts[0] ?? '', 10)
  if (!Number.isFinite(major)) return osRelease()
  const mapped = major <= 24 ? major - 9 : major + 1
  return [String(mapped), ...parts.slice(1)].join('.')
}

/** The distro label `os_info` would produce on Linux (`/etc/os-release`). */
function linuxDistro(): string {
  try {
    const text = readFileSync('/etc/os-release', 'utf8')
    const field = (key: string): string | null => {
      const match = text.match(new RegExp(`^${key}=(?:"([^"]*)"|(.*)$)`, 'm'))
      return (match?.[1] ?? match?.[2])?.trim() ?? null
    }
    return [field('NAME'), field('VERSION_ID')].filter(Boolean).join(' ') || 'Linux'
  } catch {
    return 'Linux'
  }
}

/** The OS label in the CLI's UA (`Mac OS 15.6.0` / `Ubuntu 24.04` / …). */
function osLabel(): string {
  if (osPlatform() === 'darwin') return `Mac OS ${darwinMarketingRelease()}`
  if (osPlatform() === 'linux') return linuxDistro()
  if (osPlatform() === 'win32') return `Windows ${osRelease()}`
  return osPlatform()
}

/** The architecture label (`arm64` / `x86_64`, as `std::env::consts::ARCH`). */
function archLabel(): string {
  return osArch() === 'x64' ? 'x86_64' : osArch()
}

/** The terminal segment (`TERM_PROGRAM`, or `unknown` when unset — what the
 *  CLI reports for GUI parents). */
function terminalLabel(): string {
  const program = process.env.TERM_PROGRAM
  return program !== undefined && program !== '' ? program : 'unknown'
}

let userAgentCache: string | undefined

/**
 * The User-Agent the Codex CLI itself sends — same format, same platform
 * facts. Computed once per process; the platform facts cannot change.
 * @returns the UA string.
 */
export function codexUserAgent(): string {
  userAgentCache ??= `codex_cli_rs/${CODEX_VERSION} (${osLabel()}; ${archLabel()}) ${terminalLabel()}`
  return userAgentCache
}
/** The originator header value Codex sends on every backend request. */
export const ORIGINATOR = 'codex_cli_rs'
/** ChatGPT-subscription inference base (`config/mod.rs` default). */
export const CHATGPT_BASE_URL = 'https://chatgpt.com/backend-api/codex'
/** Platform API-key inference base (`codex-api/src/provider.rs`). */
export const API_KEY_BASE_URL = 'https://api.openai.com/v1'
/** The Platform page where an API key is created. */
export const CONSOLE_URL = 'https://platform.openai.com/api-keys'

/** Authorization request extra parameters (`build_authorize_url`). */
const EXTRA_AUTHORIZE_PARAMS: readonly (readonly [string, string])[] = [
  ['id_token_add_organizations', 'true'],
  ['codex_cli_simplified_flow', 'true'],
  ['originator', ORIGINATOR],
]

/** A fresh PKCE pair: urlsafe verifier and its S256 challenge. */
export interface PkceCodes {
  readonly verifier: string
  readonly challenge: string
}

function base64url(bytes: Buffer): string {
  return bytes.toString('base64url')
}

/** Generate a PKCE verifier/challenge pair (SHA-256, S256 method). */
export function generatePkce(): PkceCodes {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

/**
 * Build the authorize URL the user's browser opens.
 * @param input - the PKCE challenge, anti-CSRF state, and local redirect.
 * @returns the URL string.
 */
export function buildAuthorizeUrl(input: {
  readonly challenge: string
  readonly state: string
  readonly redirectUri: string
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: input.redirectUri,
    scope: SCOPE,
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
    state: input.state,
  })
  for (const [key, value] of EXTRA_AUTHORIZE_PARAMS) params.set(key, value)
  return `${AUTHORIZE_URL}?${params.toString()}`
}

/** The token endpoint's success response (both grants). */
export interface TokenResponse {
  readonly access_token: string
  readonly id_token: string
  readonly refresh_token: string
  readonly expires_in: number
}

const REQUEST_TIMEOUT_MS = 30_000

/**
 * Exchange an authorization code for tokens — form-encoded, per
 * `TokenEncoding::Form` in `send_code_exchange_request`.
 */
export async function exchangeCode(input: {
  readonly code: string
  readonly verifier: string
  readonly redirectUri: string
  readonly signal?: AbortSignal
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier,
  })
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': codexUserAgent(),
    },
    body: body.toString(),
    signal: AbortSignal.any([input.signal ?? AbortSignal.abort(), AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  })
  return readTokenResponse(response, '授权码换取令牌')
}

/**
 * Refresh an access token — JSON body, per `TokenEncoding::Json` in
 * `request_chatgpt_token_refresh`.
 */
export async function refreshTokens(input: {
  readonly refreshToken: string
  readonly signal?: AbortSignal
}): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': codexUserAgent(),
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: input.refreshToken,
    }),
    signal: AbortSignal.any([input.signal ?? AbortSignal.abort(), AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  })
  return readTokenResponse(response, '令牌刷新')
}

/** Read the token endpoint's response, surfacing OAuth error payloads. */
async function readTokenResponse(response: Response, what: string): Promise<TokenResponse> {
  const text = await response.text()
  if (!response.ok) {
    let detail = text.slice(0, 300)
    try {
      const parsed = JSON.parse(text) as { error_description?: string; error?: string }
      detail = parsed.error_description ?? parsed.error ?? detail
    } catch {}
    throw new Error(`${what}失败：${response.status} ${detail}`)
  }
  const data = JSON.parse(text) as Partial<TokenResponse>
  if (typeof data.access_token !== 'string' || data.access_token === '') {
    throw new Error(`${what}失败：响应缺少 access_token。`)
  }
  return {
    access_token: data.access_token,
    id_token: typeof data.id_token === 'string' ? data.id_token : '',
    refresh_token: typeof data.refresh_token === 'string' ? data.refresh_token : '',
    expires_in: typeof data.expires_in === 'number' ? data.expires_in : 3600,
  }
}

/** The id-token claims this account consumes. */
export interface IdTokenClaims {
  readonly chatgpt_account_id?: string
  readonly email?: string
  readonly chatgpt_plan_type?: string
}

/**
 * Decode a JWT payload without verification (the token came straight from
 * the issuer over TLS; the claims only label the account, per
 * `parse_chatgpt_jwt_claims`).
 */
export function parseIdTokenClaims(idToken: string): IdTokenClaims {
  try {
    const [, payload] = idToken.split('.')
    if (payload === undefined) return {}
    const json = Buffer.from(payload, 'base64url').toString('utf8')
    const claims = JSON.parse(json) as Record<string, unknown>
    // The account block rides under `https://api.openai.com/auth` (token_data.rs).
    const auth = claims['https://api.openai.com/auth'] as Record<string, unknown> | undefined
    const accountId = typeof auth?.chatgpt_account_id === 'string' ? auth.chatgpt_account_id
      : typeof claims.chatgpt_account_id === 'string' ? claims.chatgpt_account_id : undefined
    const plan = typeof auth?.chatgpt_plan_type === 'string' ? auth.chatgpt_plan_type : undefined
    return {
      ...(accountId === undefined ? {} : { chatgpt_account_id: accountId }),
      ...(typeof claims.email === 'string' ? { email: claims.email } : {}),
      ...(plan === undefined ? {} : { chatgpt_plan_type: plan }),
    }
  } catch {
    return {}
  }
}

/**
 * Probe the model catalog a Platform API key can serve (`GET /models`).
 * The ChatGPT subscription route has no portable catalog endpoint — its
 * models come from the static table.
 */
export async function readModels(options: {
  readonly baseUrl: string
  readonly token: string
  readonly signal?: AbortSignal
}): Promise<readonly string[]> {
  const root = options.baseUrl.replace(/\/+$/, '')
  const response = await fetch(`${root}/models`, {
    headers: {
      Authorization: `Bearer ${options.token}`,
      Accept: 'application/json',
      'User-Agent': codexUserAgent(),
    },
    signal: AbortSignal.any([options.signal ?? AbortSignal.abort(), AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  })
  if (!response.ok) {
    throw new Error(`模型目录请求失败：${response.status} ${response.statusText}`)
  }
  const data = JSON.parse(await response.text()) as { data?: readonly { id?: string }[] }
  return (data.data ?? [])
    .map(model => model.id)
    .filter((id): id is string => typeof id === 'string' && id !== '')
}

/** A row of the subscription backend's `/models` payload (`ModelsResponse`
 *  wrapping `ModelInfo`): only the fields the catalog mapping consumes. */
export interface RemoteModelInfo {
  readonly slug?: string
  readonly display_name?: string
  readonly description?: string
  readonly context_window?: number
  readonly input_modalities?: readonly string[]
  readonly visibility?: string
  readonly priority?: number
}

/**
 * The official model discovery the CLI performs at startup: `GET
 * {CHATGPT_BASE_URL}/models` with the ChatGPT access token — the same
 * request `codex debug models` refreshes (the CLI then layers this over its
 * bundled `models.json`). Rows come back in the backend's own priority
 * order; `hide`-visibility rows (Daybreak, Auto Review, …) are dropped the
 * way the CLI's picker does.
 */
export async function readChatGptModels(input: {
  readonly token: string
  readonly accountId?: string
  readonly signal?: AbortSignal
}): Promise<readonly RemoteModelInfo[]> {
  const response = await fetch(`${CHATGPT_BASE_URL}/models?client_version=${CODEX_VERSION}`, {
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: 'application/json',
      // The CLI's `chatgpt_get_request` sends this even on GET.
      'Content-Type': 'application/json',
      'User-Agent': codexUserAgent(),
      originator: ORIGINATOR,
      ...(input.accountId !== undefined && input.accountId !== ''
        ? { 'chatgpt-account-id': input.accountId } : {}),
    },
    signal: AbortSignal.any([input.signal ?? AbortSignal.abort(), AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  })
  if (!response.ok) {
    // The body carries the backend's `detail` (e.g. a 400 for a missing
    // `client_version`) — surface it instead of a bare status line.
    const body = await response.text().catch(() => '')
    throw new Error(`模型目录请求失败：${response.status} ${response.statusText}${body !== '' ? ` — ${body.slice(0, 300)}` : ''}`)
  }
  const data = JSON.parse(await response.text()) as { models?: readonly RemoteModelInfo[] }
  return (data.models ?? []).filter(info =>
    typeof info.slug === 'string' && info.slug !== '' && info.visibility !== 'hide')
}

/**
 * The plugin's bundled catalog, mirroring the `models.json` the official CLI
 * ships in its binary (the offline layer the CLI falls back to when the
 * backend `/models` refresh fails). Only picker-visible rows (`list`
 * visibility), in the bundled priority order; `hide` rows (Daybreak, Auto
 * Review) are excluded the same way as the remote filter above.
 */
export const BUNDLED_CHATGPT_MODELS: readonly RemoteModelInfo[] = Object.freeze([
  { slug: 'gpt-6.1-sol', display_name: 'GPT-6.1-Sol', context_window: 272000, visibility: 'list', priority: 1 },
  { slug: 'gpt-6-astra', display_name: 'GPT-6-Astra', context_window: 272000, visibility: 'list', priority: 2 },
  { slug: 'gpt-6-sol', display_name: 'GPT-6-Sol', context_window: 272000, visibility: 'list', priority: 3 },
  { slug: 'gpt-6-luna', display_name: 'GPT-6-Luna', context_window: 272000, visibility: 'list', priority: 4 },
  { slug: 'gpt-5.6-sol', display_name: 'GPT-5.6-Sol', context_window: 272000, visibility: 'list', priority: 5 },
  { slug: 'gpt-5.6-terra', display_name: 'GPT-5.6-Terra', context_window: 272000, visibility: 'list', priority: 8 },
  { slug: 'gpt-5.6-luna', display_name: 'GPT-5.6-Luna', context_window: 272000, visibility: 'list', priority: 9 },
  { slug: 'gpt-5.5', display_name: 'GPT-5.5', context_window: 272000, visibility: 'list', priority: 13 },
])

/** Merge the remote catalog over the bundled one: remote rows keep the
 *  backend's priority order; bundled rows the backend does not list are
 *  appended (dedup by slug) so the picker always offers the plugin's
 *  internal set too — the CLI's layering semantics. */
export function mergeWithBundledModels(
  remote: readonly RemoteModelInfo[],
  bundled: readonly RemoteModelInfo[] = BUNDLED_CHATGPT_MODELS,
): readonly RemoteModelInfo[] {
  const seen = new Set(remote.map(info => info.slug))
  const extras = bundled.filter(info => !seen.has(info.slug))
  return extras.length === 0 ? remote : [...remote, ...extras]
}

/** The usage endpoint the CLI's `/status` and `/usage` read. */
export const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'

/** One usage window of the wham payload. */
export interface UsageWindow {
  readonly used_percent?: number
  readonly reset_at?: number
  readonly limit_window_seconds?: number
}

/** The slice of the wham/usage payload this account displays: the plan, the
 *  two enforced rate-limit windows, and the optional purchased credits. */
export interface WhamUsage {
  readonly planType?: string
  readonly primary?: UsageWindow
  readonly secondary?: UsageWindow
  readonly creditsBalance?: number
  readonly creditsUnlimited?: boolean
}

/**
 * Read the subscription usage snapshot — `GET {USAGE_URL}` with the ChatGPT
 * access token (the same call behind `codex` `/status`). The subscription
 * model has no prepaid "balance" page; what it enforces are the two rolling
 * windows (≈5 h primary, ≈7 d secondary) plus optional purchased credits.
 */
export async function readWhamUsage(input: {
  readonly token: string
  readonly accountId?: string
  readonly signal?: AbortSignal
}): Promise<WhamUsage> {
  const response = await fetch(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: 'application/json',
      'User-Agent': codexUserAgent(),
      originator: ORIGINATOR,
      ...(input.accountId !== undefined && input.accountId !== ''
        ? { 'chatgpt-account-id': input.accountId } : {}),
    },
    signal: AbortSignal.any([input.signal ?? AbortSignal.abort(), AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  })
  if (!response.ok) {
    throw new Error(`用量请求失败：${response.status} ${response.statusText}`)
  }
  const data = JSON.parse(await response.text()) as {
    plan_type?: string
    rate_limit?: { primary_window?: UsageWindow; secondary_window?: UsageWindow }
    credits?: { has_credits?: boolean; unlimited?: boolean; balance?: number }
  }
  const credits = data.credits
  return {
    ...(typeof data.plan_type === 'string' && data.plan_type !== '' ? { planType: data.plan_type } : {}),
    ...(data.rate_limit?.primary_window === undefined ? {} : { primary: data.rate_limit.primary_window }),
    ...(data.rate_limit?.secondary_window === undefined ? {} : { secondary: data.rate_limit.secondary_window }),
    ...(credits?.has_credits === true && credits.unlimited !== true && typeof credits.balance === 'number'
      ? { creditsBalance: credits.balance, creditsUnlimited: false } : {}),
  }
}
