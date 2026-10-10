/**
 * The Claude OAuth / API-key protocol surface, per the Claude Code login
 * flow (the same authorization-code + PKCE the official CLI performs —
 * community-documented, e.g. the cedws gist on the Claude Code OAuth flow).
 *
 * Two login paths:
 *
 * - **Claude subscription (Pro/Max)**: OAuth authorization-code + PKCE
 *   against `claude.ai/oauth/authorize` in paste mode (`code=true`): the
 *   redirect target is Anthropic's hosted callback page, which displays the
 *   grant as `code#state` for the user to copy back — no local callback
 *   server. The exchange and every refresh post a **JSON** body to
 *   `console.anthropic.com/v1/oauth/token`. The resulting access token
 *   carries the `sk-ant-oat01-` prefix, which pi-ai's anthropic-messages
 *   route recognizes and sends as `Authorization: Bearer` with the Claude
 *   Code identity headers.
 * - **Anthropic Console API key**: a plain `sk-ant-api…` key against
 *   `api.anthropic.com/v1`, billed per token — a separate wallet from the
 *   subscription entirely.
 *
 * There is deliberately no account/password path: the only credentials this
 * plugin accepts are the OAuth grant the user completes on Anthropic's own
 * pages and a Console key the user created in the Anthropic Console.
 *
 * @module claude-account/protocol
 */

import { createHash, randomBytes } from 'node:crypto'

/** The public Claude Code OAuth client id. */
export const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
/** The authorize endpoint (claude.ai web session). */
export const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize'
/** The token endpoint (exchange + refresh), JSON body. */
export const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
/** Anthropic's hosted redirect — the paste-mode target the user sees. */
export const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback'
/** Requested scopes (the Claude Code set). */
export const SCOPE = 'org:create_api_key user:profile user:inference'

/** The Claude Code version this plugin's fingerprint mirrors. */
export const CLAUDE_VERSION = '2.1.280'

/** The User-Agent the official CLI sends on OAuth and API requests. */
export function claudeUserAgent(): string {
  return `claude-cli/${CLAUDE_VERSION} (external, cli)`
}

/** The beta header value subscription (OAuth) inference requests require. */
export const OAUTH_BETA = 'oauth-2025-04-20,claude-code-20250219'

/** The subscription inference base (Messages API; OAuth rides the same
 *  public endpoint as keys, distinguished by the token shape). */
export const API_BASE_URL = 'https://api.anthropic.com'
/** The Console page where an API key is created. */
export const CONSOLE_URL = 'https://console.anthropic.com/settings/keys'

/** The API version header every Anthropic REST call carries. */
export const ANTHROPIC_VERSION = '2023-06-01'

// ---- PKCE -----------------------------------------------------------------

/** A fresh PKCE pair: urlsafe verifier and its S256 challenge. */
export interface PkceCodes {
  readonly verifier: string
  readonly challenge: string
}

/** Generate a PKCE verifier/challenge pair (SHA-256, S256 method). */
export function generatePkce(): PkceCodes {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

/**
 * Build the authorize URL the user's browser opens (paste mode: `code=true`
 * makes the hosted callback page display the grant instead of redirecting
 * anywhere). Per the documented flow, `state` equals the PKCE verifier.
 * @param input - the PKCE pair.
 * @returns the URL string.
 */
export function buildAuthorizeUrl(input: PkceCodes): string {
  const params = new URLSearchParams({
    code: 'true',
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
    state: input.verifier,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

/**
 * Parse what the user pasted back: the hosted callback page shows the grant
 * as `code#state`, and many users copy the whole callback URL instead.
 * Accepts both, plus a bare code.
 * @param input - the pasted string.
 * @returns the authorization code and the state when present.
 */
export function parsePastedGrant(input: string): { code: string; state?: string } {
  const text = input.trim()
  // A full callback URL: read code/state from the query string.
  if (/^https?:\/\//i.test(text)) {
    const url = new URL(text)
    const code = url.searchParams.get('code') ?? ''
    const state = url.searchParams.get('state') ?? undefined
    if (code === '') throw new Error('回调 URL 里没有 code 参数。')
    return { code, ...(state !== undefined && state !== '' ? { state } : {}) }
  }
  // The page's own display form: code#state.
  const hash = text.indexOf('#')
  if (hash >= 0) {
    const code = text.slice(0, hash).trim()
    const state = text.slice(hash + 1).trim()
    if (code === '') throw new Error('授权码为空。')
    return { code, ...(state !== '' ? { state } : {}) }
  }
  if (text === '') throw new Error('授权码为空。')
  return { code: text }
}

/** The token endpoint's success response (both grants; Claude's flow has no
 *  id token — the access token's `sk-ant-oat01-` prefix is the identity). */
export interface TokenResponse {
  readonly access_token: string
  readonly refresh_token: string
  readonly expires_in: number
}

const REQUEST_TIMEOUT_MS = 30_000

async function postToken(body: Record<string, unknown>, what: string, signal?: AbortSignal): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': claudeUserAgent(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal ?? AbortSignal.abort(), AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  })
  const text = await response.text()
  if (!response.ok) {
    let detail = text.slice(0, 300)
    try {
      const parsed = JSON.parse(text) as { error_description?: string; error?: string; message?: string }
      detail = parsed.error_description ?? parsed.error ?? parsed.message ?? detail
    } catch {}
    throw new Error(`${what}失败：${response.status} ${detail}`)
  }
  const data = JSON.parse(text) as Partial<TokenResponse>
  if (typeof data.access_token !== 'string' || data.access_token === '') {
    throw new Error(`${what}失败：响应缺少 access_token。`)
  }
  return {
    access_token: data.access_token,
    refresh_token: typeof data.refresh_token === 'string' ? data.refresh_token : '',
    expires_in: typeof data.expires_in === 'number' ? data.expires_in : 3600,
  }
}

/**
 * Exchange an authorization code for the token set — JSON body, per the
 * documented flow.
 */
export async function exchangeCode(input: {
  readonly code: string
  readonly state?: string
  readonly verifier: string
  readonly signal?: AbortSignal
}): Promise<TokenResponse> {
  return await postToken({
    grant_type: 'authorization_code',
    code: input.code,
    ...(input.state !== undefined ? { state: input.state } : {}),
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_verifier: input.verifier,
  }, '授权码换取令牌', input.signal)
}

/** Refresh an access token — same endpoint, JSON `refresh_token` grant. */
export async function refreshTokens(input: {
  readonly refreshToken: string
  readonly signal?: AbortSignal
}): Promise<TokenResponse> {
  return await postToken({
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
    client_id: CLIENT_ID,
  }, '令牌刷新', input.signal)
}

/**
 * Probe the model catalog a Console API key can serve (`GET /v1/models`).
 * The subscription route has no portable catalog endpoint — its models come
 * from the static bundled table.
 */
export async function readConsoleModels(options: {
  readonly baseUrl: string
  readonly apiKey: string
  readonly signal?: AbortSignal
}): Promise<readonly string[]> {
  const root = options.baseUrl.replace(/\/+$/, '')
  const response = await fetch(`${root}/v1/models`, {
    headers: {
      'x-api-key': options.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      Accept: 'application/json',
      'User-Agent': claudeUserAgent(),
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

/** One row of the subscription's bundled catalog: the fields the route's
 *  model mapping consumes. */
export interface BundledModelInfo {
  readonly id: string
  readonly name: string
  readonly contextWindow: number
  readonly maxTokens: number
}

/**
 * The plugin's bundled catalog for the subscription mode: the current
 * generally-available Claude model line. The subscription backend serves no
 * model-list endpoint a third-party client can read, so the table is static
 * — the same trade the official CLI's bundled `models.json` makes.
 */
export const BUNDLED_CLAUDE_MODELS: readonly BundledModelInfo[] = Object.freeze([
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', contextWindow: 200_000, maxTokens: 64_000 },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 200_000, maxTokens: 64_000 },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', contextWindow: 200_000, maxTokens: 64_000 },
])
