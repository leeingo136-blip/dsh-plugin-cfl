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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
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
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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
    headers: { Authorization: `Bearer ${options.token}`, Accept: 'application/json' },
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
