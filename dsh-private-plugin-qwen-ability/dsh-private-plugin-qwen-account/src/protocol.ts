/**
 * The Qwen OAuth 2.0 device-authorization flow, stated locally.
 *
 * Mirrors `qwen-code` `packages/core/src/qwen/qwenOAuth2.ts` (Apache-2.0):
 * RFC 8628 device authorization grant with PKCE (RFC 7636, S256) against
 * `chat.qwen.ai`, the public client id qwen-code ships, and the
 * `x-request-id` header that client stamps on every authorization request —
 * a per-request random UUID. There is no persistent device fingerprint in
 * the official client; the durable login fact is the token pair alone.
 *
 * Token responses carry `resource_url` — the inference endpoint the tokens
 * are bound to — which the route profile uses as its base URL (falling back
 * to DashScope's OpenAI-compatible endpoint).
 *
 * @module qwen-account/protocol
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto'

/** The authorization server root qwen-code ships. */
export const QWEN_OAUTH_BASE_URL = 'https://chat.qwen.ai'
/** Device-authorization endpoint (RFC 8628 §3.1). */
export const QWEN_OAUTH_DEVICE_CODE_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/device/code`
/** Token endpoint (RFC 8628 §3.4 polling + RFC 6749 §6 refresh). */
export const QWEN_OAUTH_TOKEN_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/token`
/** The public client id qwen-code registers; the tokens are scoped to it. */
export const QWEN_OAUTH_CLIENT_ID = 'f0304373b74a44d2b584a3fb70ca9e56'
/** The scope qwen-code requests: identity plus model-completion access. */
export const QWEN_OAUTH_SCOPE = 'openid profile email model.completion'
/** The device-grant URN. */
export const QWEN_OAUTH_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

/** Fallback inference root when the token response names no `resource_url`. */
export const DEFAULT_RESOURCE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

const REQUEST_TIMEOUT_MS = 30_000
/** The device-grant lifetime fallback when the server omits `expires_in`. */
const DEFAULT_DEVICE_AUTH_EXPIRES_IN = 300

/** A PKCE verifier/challenge pair (RFC 7636 §4.1-4.2). */
export interface PkcePair {
  readonly code_verifier: string
  readonly code_challenge: string
}

/** RFC 7636 §4.1: a high-entropy verifier, 43-128 chars of the unreserved set. */
export function generatePkcePair(): PkcePair {
  const code_verifier = randomBytes(32).toString('base64url')
  const code_challenge = createHash('sha256').update(code_verifier).digest('base64url')
  return { code_verifier, code_challenge }
}

/** The device-authorization response fields the flow consumes. */
export interface DeviceAuthorization {
  readonly device_code: string
  readonly user_code: string
  readonly verification_uri: string
  readonly verification_uri_complete: string
  readonly expires_in: number
}

/**
 * Step 1 — request device authorization. The response names the URL the user
 * opens (and the `user_code` it displays); the caller opens a browser on
 * `verification_uri_complete` and polls step 2 until it approves.
 */
export async function requestDeviceAuthorization(options: {
  readonly code_challenge: string
  readonly signal?: AbortSignal
}): Promise<DeviceAuthorization> {
  const body = new URLSearchParams({
    client_id: QWEN_OAUTH_CLIENT_ID,
    scope: QWEN_OAUTH_SCOPE,
    code_challenge: options.code_challenge,
    code_challenge_method: 'S256',
  })
  const response = await fetch(QWEN_OAUTH_DEVICE_CODE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      // The per-request identity the official client stamps (see module doc):
      // a random UUID, nothing persisted.
      'x-request-id': randomUUID(),
    },
    body,
    signal: AbortSignal.any([options.signal ?? AbortSignal.abort(), AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`设备授权请求失败：${response.status} ${response.statusText} — ${text.slice(0, 200)}`)
  }
  const data = JSON.parse(text) as Record<string, unknown>
  if (typeof data.device_code !== 'string' || typeof data.verification_uri_complete !== 'string') {
    throw new Error('设备授权响应缺少 device_code / verification_uri_complete。')
  }
  return {
    device_code: data.device_code,
    user_code: typeof data.user_code === 'string' ? data.user_code : '',
    verification_uri: typeof data.verification_uri === 'string' ? data.verification_uri : data.verification_uri_complete,
    verification_uri_complete: data.verification_uri_complete,
    expires_in: typeof data.expires_in === 'number' && data.expires_in > 0
      ? data.expires_in
      : DEFAULT_DEVICE_AUTH_EXPIRES_IN,
  }
}

/** The token-set fields a successful poll or refresh yields. */
export interface TokenSet {
  readonly accessToken: string
  readonly refreshToken?: string
  readonly tokenType?: string
  /** Inference endpoint the tokens are bound to, when the server states one. */
  readonly resourceUrl?: string
  /** Absolute epoch ms when the access token expires. */
  readonly expiresAt: number
}

/** A poll outcome: still waiting (`slowDown` asks for a longer interval) or the tokens. */
export type DevicePoll =
  | { readonly status: 'pending'; readonly slowDown?: boolean }
  | ({ readonly status: 'success' } & TokenSet)

/**
 * Step 2 — one token poll with the device code and PKCE verifier. RFC 8628
 * pending/slow-down states come back as HTTP 400 bodies; anything else
 * non-200 is a real failure.
 */
export async function pollDeviceToken(options: {
  readonly device_code: string
  readonly code_verifier: string
  readonly signal?: AbortSignal
}): Promise<DevicePoll> {
  const body = new URLSearchParams({
    grant_type: QWEN_OAUTH_GRANT_TYPE,
    client_id: QWEN_OAUTH_CLIENT_ID,
    device_code: options.device_code,
    code_verifier: options.code_verifier,
  })
  const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    signal: AbortSignal.any([options.signal ?? AbortSignal.abort(), AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  })
  const text = await response.text()
  if (!response.ok) {
    let error: { error?: string } = {}
    try { error = JSON.parse(text) as { error?: string } } catch { /* non-JSON error body */ }
    if (response.status === 400 && error.error === 'authorization_pending') {
      return { status: 'pending' }
    }
    if (response.status === 400 && error.error === 'slow_down') {
      return { status: 'pending', slowDown: true }
    }
    if (response.status === 400 && error.error === 'access_denied') {
      throw new Error('用户拒绝了授权。')
    }
    if (response.status === 400 && (error.error === 'expired_token' || error.error === 'device_code_expired')) {
      throw new Error('设备授权已过期，请重新发起登录。')
    }
    throw new Error(`令牌轮询失败：${response.status} ${response.statusText} — ${text.slice(0, 200)}`)
  }
  const data = JSON.parse(text) as Record<string, unknown>
  if (typeof data.access_token !== 'string') {
    throw new Error('令牌响应缺少 access_token。')
  }
  return {
    status: 'success',
    accessToken: data.access_token,
    ...(typeof data.refresh_token === 'string' && data.refresh_token !== '' ? { refreshToken: data.refresh_token } : {}),
    ...(typeof data.token_type === 'string' ? { tokenType: data.token_type } : {}),
    ...(typeof data.resource_url === 'string' && data.resource_url !== '' ? { resourceUrl: data.resource_url } : {}),
    expiresAt: typeof data.expires_in === 'number'
      ? Date.now() + data.expires_in * 1000
      : Date.now() + 3600 * 1000,
  }
}

/**
 * Refresh the access token (RFC 6749 §6). Throws on a rejected refresh token
 * (400/401 mean the login is dead and the caller should sign the account out).
 */
export async function refreshAccessToken(options: {
  readonly refresh_token: string
  readonly signal?: AbortSignal
}): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: options.refresh_token,
    client_id: QWEN_OAUTH_CLIENT_ID,
  })
  const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    signal: AbortSignal.any([options.signal ?? AbortSignal.abort(), AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`令牌刷新失败：${response.status} ${response.statusText} — ${text.slice(0, 200)}`)
  }
  const data = JSON.parse(text) as Record<string, unknown>
  if (typeof data.access_token !== 'string') {
    throw new Error('刷新响应缺少 access_token。')
  }
  return {
    accessToken: data.access_token,
    // RFC 6749 §6: the server MAY issue a new refresh token; keep the old one
    // when it does not.
    ...(typeof data.refresh_token === 'string' && data.refresh_token !== '' ? { refreshToken: data.refresh_token } : {}),
    ...(typeof data.token_type === 'string' ? { tokenType: data.token_type } : {}),
    ...(typeof data.resource_url === 'string' && data.resource_url !== '' ? { resourceUrl: data.resource_url } : {}),
    expiresAt: typeof data.expires_in === 'number'
      ? Date.now() + data.expires_in * 1000
      : Date.now() + 3600 * 1000,
  }
}

/** Probe the model catalog the token can serve (`GET /models`). */
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
