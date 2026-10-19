/**
 * Z.ai account wire facts: the ZCode CLI polling sign-in flow (init → browser
 * → poll) and the OpenAI-compatible model list read that doubles as an API-key
 * check.
 *
 * Everything here is transport only — no Cordis, no credentials storage. The
 * service owns the credential records; this module answers "what does the
 * platform say" for a given token.
 *
 * The sign-in flow mirrors ZCode's desktop client
 * (`packages/services/src/oauth/oauthService.ts`, Apache-2.0 open source): the
 * platform issues the authorize URL, the client rewrites its redirect to the
 * official hand-off page (the one desktop-shaped value registered for this
 * OAuth client — a self-built loopback URI is refused with "Redirect URI not
 * registered"), and the token comes back through server-side polling. No local
 * HTTP listener and no deep-link scheme are involved; polling is the reliable
 * path even when the hand-off page finds no app to open.
 *
 * One upstream contract this module also mirrors: the Z.AI OAuth access token
 * returned by the poll is NOT the credential Z.ai's business interfaces
 * accept. ZCode exchanges it at login (`POST /api/auth/z/login`, the
 * business-token resolver in `zaiBusinessTokenResolver.ts`) and persists the
 * resulting platform JWT — `exchangeZaiBusinessToken` below is that step, and
 * the sign-in flow stores its answer instead of the raw OAuth token.
 */

import { randomBytes } from 'node:crypto'
import { z } from 'zod'

/** Default OpenAI-compatible inference root for GLM models on Z.ai. */
export const DEFAULT_BASE_URL = 'https://api.z.ai/api/paas/v4'
/** Default OpenAI-compatible inference root for GLM models on BigModel. */
export const DEFAULT_BIGMODEL_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
/** Default Z.ai console origin: the outward account links the card shows. */
export const DEFAULT_ZAI_ORIGIN = 'https://chat.z.ai'
/** Default BigModel console origin: the outward account links for that login. */
export const DEFAULT_BIGMODEL_ORIGIN = 'https://bigmodel.cn'
/** The ZCode endpoint origin hosting the CLI flow endpoints and the official
 *  hand-off page the browser redirect lands on. */
export const DEFAULT_ZCODE_ORIGIN = 'https://zcode.z.ai'
/** BigModel's console API origin: the monetary-wallet balance lives there. */
export const BIGMODEL_MONEY_ORIGIN = 'https://open.bigmodel.cn'

/** The provider name the flow endpoints expect for each platform's grant. */
const FLOW_PROVIDERS = { zai: 'zai', bigmodel: 'bigmodel' } as const
const FLOW_INIT_PATH = '/api/v1/oauth/cli/init'
const FLOW_POLL_PATH = '/api/v1/oauth/cli/poll'
/** The app version the hand-off page keys its deep-link behaviour on; kept
 *  at the current ZCode desktop release so the page and the version-gated
 *  endpoints (plan balance) apply their present-day policy. */
const DESKTOP_APP_VERSION = '3.15.3'

/** One login the plugin stores. `issuer` is the origin that issued it. */
export interface StoredGrant {
  version: 1
  /** `oauth`: a browser sign-in. `apikey`: a key the user pasted. */
  kind: 'oauth' | 'apikey'
  /** Which platform issued the token; absent on grants from before the
   *  BigModel login existed, and those are Z.ai grants. */
  provider?: OAuthProvider | undefined
  /** The bearer credential sent to the inference endpoint. */
  token: string
  /** Origin that issued the credential; only its own endpoint receives it. */
  issuer: string
  expiresAt?: number | undefined
  /** BigModel pairs its access token with a refresh token; Z.ai does not. */
  refreshToken?: string | undefined
  /** The ZCode endpoint JWT the poll answers carry beside the platform token;
   *  the plan-balance endpoint accepts only this, from either platform. */
  zcodeJwt?: string | undefined
  /** The inference key the account provisioned for itself through the
   *  platform's business console (OAuth tokens cannot infer). Preferred over
   *  `token` for inference; identity and balance reads still use `token`. */
  apiKey?: string | undefined
}

/** The two platforms the CLI flow can sign into. */
export type OAuthProvider = 'zai' | 'bigmodel'

/** The account identity shown on the signed-in card. */
export interface AccountProfile {
  name?: string
  contact?: string
  avatarUrl?: string
}

/** One server-side sign-in flow. Poll with the same bearer token until the
 *  status leaves `pending` or the flow expires. */
export interface CliFlow {
  flowId: string
  authorizeUrl: string
  pollToken: string
  /** Epoch ms after which the platform drops the flow. */
  expiresAt: number
  pollIntervalMs: number
}

/** One poll answer: keep waiting, give up, or take the credential. The
 *  refresh token only exists on the BigModel grant; the ZCode JWT arrives on
 *  both and is what the plan-balance endpoint accepts. */
export type CliPoll =
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'ready'; token: string; refreshToken?: string; zcodeJwt?: string; user: unknown }

/** A transport-level refusal, carrying the HTTP status for the caller's policy. */
export class PlatformRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'PlatformRequestError'
  }
}

/** Join a base URL and a path without doubling or dropping separators. */
export function endpoint(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/** The platform's `{code, msg, data}` envelope around every flow answer. */
const jsonEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ code: z.number(), msg: z.string().optional(), data: data.optional().nullable() })

const flowInitData = z.object({
  flow_id: z.string().min(1),
  authorize_url: z.string().min(1),
  expires_at: z.number(),
  poll_interval_sec: z.number(),
})

const pollData = z.object({
  status: z.string(),
  /** The ZCode endpoint JWT; the balance endpoint rejects the platform token. */
  token: z.string().optional().nullable(),
  zai: z.object({ access_token: z.string().optional() }).optional().nullable(),
  bigmodel: z.object({
    access_token: z.string().optional(),
    accessToken: z.string().optional(),
    refresh_token: z.string().optional(),
    refreshToken: z.string().optional(),
  }).optional().nullable(),
  user: z.unknown().optional(),
})

/**
 * Open one sign-in flow. The bearer token returned beside it is the only
 * credential that may poll this flow — keep the pair together.
 */
export async function startCliFlow(input: {
  origin: string
  provider: OAuthProvider
  signal?: AbortSignal
}): Promise<CliFlow> {
  const pollToken = randomBytes(32).toString('hex')
  const response = await fetch(endpoint(input.origin, FLOW_INIT_PATH), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${pollToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ provider: FLOW_PROVIDERS[input.provider] }),
    ...input.signal === undefined ? {} : { signal: input.signal },
  })
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new PlatformRequestError(`Z.ai 登录发起失败：HTTP ${String(response.status)}`, response.status)
  }
  const payload = jsonEnvelope(flowInitData).safeParse(await response.json())
  if (!payload.success) throw new PlatformRequestError('Z.ai 登录发起失败：响应格式不正确。')
  if (payload.data.code !== 0 || payload.data.data == null) {
    throw new PlatformRequestError(`Z.ai 登录发起失败：${payload.data.msg?.trim() || '未知错误'}`)
  }
  const data = payload.data.data
  return {
    flowId: data.flow_id,
    authorizeUrl: data.authorize_url,
    pollToken,
    expiresAt: data.expires_at * 1000,
    pollIntervalMs: Math.max(data.poll_interval_sec * 1000, 1_000),
  }
}

/**
 * The value that replaces the authorize URL's redirect parameter: ZCode's
 * official hand-off page, registered for this client. The page forwards the
 * code to `zcode://oauth/callback`; whether or not any app handles that link,
 * the token still arrives through polling.
 */
export function desktopHandoffRedirect(origin: string): string {
  const url = new URL('/app/oauth/login', origin)
  url.searchParams.set('redirect', 'zcode://oauth/callback')
  url.searchParams.set('app_version', DESKTOP_APP_VERSION)
  return url.toString()
}

/**
 * The authorize-URL query parameter that carries the redirect: the two
 * platforms name it differently, and the platform ignores the other spelling.
 */
export function handoffParam(provider: OAuthProvider): 'redirect' | 'redirect_uri' {
  return provider === 'bigmodel' ? 'redirect' : 'redirect_uri'
}

/**
 * Poll one round. Network hiccups and 5xx surface as thrown transport errors —
 * the caller decides whether a round is worth retrying. The token field is
 * provider-specific (`zai` vs `bigmodel`, the latter also carrying camelCase
 * and refresh variants); the hand-off parameter is too, but that rewrite is
 * the start side's business.
 */
export async function pollCliFlow(input: {
  origin: string
  flowId: string
  pollToken: string
  provider: OAuthProvider
  signal?: AbortSignal
}): Promise<CliPoll> {
  const response = await fetch(endpoint(input.origin, `${FLOW_POLL_PATH}/${encodeURIComponent(input.flowId)}`), {
    headers: { authorization: `Bearer ${input.pollToken}`, accept: 'application/json' },
    ...input.signal === undefined ? {} : { signal: input.signal },
  })
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new PlatformRequestError(`Z.ai 登录查询失败：HTTP ${String(response.status)}`, response.status)
  }
  const payload = jsonEnvelope(pollData).safeParse(await response.json())
  if (!payload.success || payload.data.code !== 0 || payload.data.data == null) {
    throw new PlatformRequestError('Z.ai 登录查询失败：响应格式不正确。')
  }
  const data = payload.data.data
  if (data.status === 'pending') return { status: 'pending' }
  if (data.status === 'failed') return { status: 'failed' }
  if (data.status !== 'ready') {
    throw new PlatformRequestError('Z.ai 登录查询失败：响应缺少 access_token。')
  }
  const zcodeJwt = data.token?.trim()
  if (input.provider === 'bigmodel') {
    const token = (data.bigmodel?.access_token ?? data.bigmodel?.accessToken)?.trim()
    if (token === undefined || token === '') {
      throw new PlatformRequestError('BigModel 登录查询失败：响应缺少 access_token。')
    }
    const refreshToken = (data.bigmodel?.refresh_token ?? data.bigmodel?.refreshToken)?.trim()
    return {
      status: 'ready', token, user: data.user,
      ...(refreshToken === undefined || refreshToken === '' ? {} : { refreshToken }),
      ...(zcodeJwt === undefined || zcodeJwt === '' ? {} : { zcodeJwt }),
    }
  }
  const token = data.zai?.access_token?.trim()
  if (token === undefined || token === '') {
    throw new PlatformRequestError('Z.ai 登录查询失败：响应缺少 access_token。')
  }
  return {
    status: 'ready', token, user: data.user,
    ...(zcodeJwt === undefined || zcodeJwt === '' ? {} : { zcodeJwt }),
  }
}

/** One plan-quota line the Z.ai balance read produced. */
export interface BalanceLine {
  label: string
  value: string
}

const zaiBalanceResponse = z.object({
  code: z.number().optional(),
  success: z.boolean().optional(),
  msg: z.string().optional(),
  data: z.object({
    balances: z.array(z.object({
      show_name: z.string().optional().nullable(),
      meter: z.string().optional().nullable(),
      total_units: z.union([z.number(), z.string()]).optional().nullable(),
      remaining_units: z.union([z.number(), z.string()]).optional().nullable(),
      available_units: z.union([z.number(), z.string()]).optional().nullable(),
    })).optional(),
  }).optional().nullable(),
})

/**
 * Read the Start Plan balance. The endpoint lives on the ZCode endpoint
 * origin (not the inference root) and accepts only the ZCode endpoint JWT the
 * poll answers carry — the platform access token is refused — mirroring
 * ZCode's own reader (`model-provider/zaiStartPlanBilling.ts`, and the
 * bigmodel branch of `resolveStartPlanAuthorization` builds the very same
 * credential). Units arrive as number or string depending on the meter;
 * unparseable rows are skipped, and an answer without usable rows yields an
 * empty list rather than an error — the caller renders its fallback link
 * either way.
 */
export async function readZaiBalance(input: {
  origin: string
  zcodeJwt: string
  signal?: AbortSignal
}): Promise<readonly BalanceLine[]> {
  const url = new URL('/api/v1/zcode-plan/billing/balance', input.origin)
  url.searchParams.set('app_version', DESKTOP_APP_VERSION)
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${input.zcodeJwt}`, accept: 'application/json' },
    ...input.signal === undefined ? {} : { signal: input.signal },
  })
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel().catch(() => undefined)
    throw new PlatformRequestError('凭据无效或已过期。', response.status)
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new PlatformRequestError(`余额读取失败：HTTP ${String(response.status)}`, response.status)
  }
  const payload = zaiBalanceResponse.safeParse(await response.json())
  if (!payload.success) throw new PlatformRequestError('余额读取失败：响应格式不正确。')
  const lines: BalanceLine[] = []
  for (const row of payload.data.data?.balances ?? []) {
    const remaining = unitValue(row.remaining_units ?? row.available_units)
    const total = unitValue(row.total_units)
    if (remaining === undefined && total === undefined) continue
    const label = row.show_name?.trim() || row.meter?.trim() || '余额'
    const value = remaining === undefined ? String(total)
      : total === undefined ? `剩 ${remaining}`
      : `${remaining} / ${total}`
    lines.push({ label, value })
    if (lines.length >= 4) break
  }
  return lines
}

/** Format one balance figure: integers grouped, everything else rounded. */
function unitValue(raw: number | string | null | undefined): string | undefined {
  if (raw === null || raw === undefined) return undefined
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return undefined
  return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(2)
}

const moneyBalanceResponse = z.object({
  code: z.number().optional(),
  success: z.boolean().optional(),
  msg: z.string().optional(),
  data: z.object({
    balance: z.union([z.number(), z.string()]).optional().nullable(),
  }).optional().nullable(),
})

/**
 * Read the monetary wallet balance from the console account-report endpoint —
 * the retired PaaS `/account/billing`'s replacement (`query-customer-account-report`,
 * CNY on BigModel, USD on Z.AI international). The envelope answers HTTP 200
 * even for application-level failures, so the business code is checked here:
 * 1001/401 mean the credential was refused. A credential failure falls back
 * to the platform's endpoint JWT when one is supplied — two token kinds, one
 * wallet. `undefined` (no balance field) is not an error: the account just
 * reports none, and the caller keeps its fallback link.
 */
export async function readMoneyBalance(input: {
  origin: string
  token: string
  currency: 'CNY' | 'USD'
  fallbackToken?: string
  signal?: AbortSignal
}): Promise<BalanceLine | undefined> {
  const url = endpoint(input.origin, '/api/biz/account/query-customer-account-report')
  const request = async (token: string): Promise<Response> => fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    ...input.signal === undefined ? {} : { signal: input.signal },
  })
  let response = await request(input.token)
  if ((response.status === 401 || response.status === 403)
    && input.fallbackToken !== undefined && input.fallbackToken !== '') {
    await response.body?.cancel().catch(() => undefined)
    response = await request(input.fallbackToken)
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel().catch(() => undefined)
    throw new PlatformRequestError('凭据无效或已过期。', response.status)
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new PlatformRequestError(`余额读取失败：HTTP ${String(response.status)}`, response.status)
  }
  const payload = moneyBalanceResponse.safeParse(await response.json())
  if (!payload.success) throw new PlatformRequestError('余额读取失败：响应格式不正确。')
  const { code, success, msg } = payload.data
  if (success === false || (code !== undefined && code >= 400)) {
    throw new PlatformRequestError(`余额读取失败：${msg?.trim() || '平台拒绝该凭据。'}`, code)
  }
  const raw = payload.data.data?.balance
  if (raw === null || raw === undefined) return undefined
  const amount = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(amount)) return undefined
  const symbol = input.currency === 'CNY' ? '¥' : '$'
  return { label: '余额', value: `${symbol}${amount.toFixed(2)}` }
}

/** The model list endpoint's answer. */
const modelListResponse = z.object({
  data: z.array(z.object({ id: z.string().optional(), owned_by: z.string().optional() })).optional(),
})

/**
 * Read the model list the endpoint advertises for one credential. Doubles as
 * the API-key check: a key the platform rejects answers 401 here, before any
 * chat request is ever paid for.
 */
export async function readModels(input: {
  baseUrl: string
  token: string
  signal?: AbortSignal
}): Promise<readonly string[]> {
  const response = await fetch(endpoint(input.baseUrl, '/models'), {
    headers: { authorization: `Bearer ${input.token}`, accept: 'application/json' },
    ...input.signal === undefined ? {} : { signal: input.signal },
  })
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel().catch(() => undefined)
    throw new PlatformRequestError('凭据无效或已过期。', response.status)
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new PlatformRequestError(`模型列表读取失败：HTTP ${String(response.status)}`, response.status)
  }
  const payload = modelListResponse.safeParse(await response.json())
  if (!payload.success) throw new PlatformRequestError('模型列表读取失败：响应格式不正确。')
  return (payload.data.data ?? [])
    .map(row => row.id ?? '')
    .filter(id => id !== '')
}

/**
 * Project one raw flow `user` object onto the card's identity. The polled
 * shape carries `user_id`, `name`, `email` and `avatar`; every field is read
 * defensively and a wholly unknown shape yields no identity rather than an
 * error — the card still renders, only without a name.
 */
export function profileOf(user: unknown): AccountProfile | undefined {
  if (typeof user !== 'object' || user === null) return undefined
  const row = user as Record<string, unknown>
  const first = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = row[key]
      if (typeof value === 'string' && value.trim() !== '') return value.trim()
    }
    return undefined
  }
  const name = first('displayName', 'display_name', 'name', 'username')
  const contact = first('email', 'phone', 'mobile', 'username')
  const avatarUrl = first('avatarUrl', 'avatar_url', 'avatar')
  if (name === undefined && contact === undefined && avatarUrl === undefined) return undefined
  return {
    ...name === undefined ? {} : { name },
    ...contact === undefined ? {} : { contact },
    ...avatarUrl === undefined ? {} : { avatarUrl: normalizeAvatar(avatarUrl) },
  }
}

/** Accept a remote URL or a bare base64 payload the way ZCode's own
 *  normalizer does; anything else is left to the card, which ignores it. */
function normalizeAvatar(value: string): string {
  if (/^data:image\/[^;]+;base64,/i.test(value) || /^https?:\/\//i.test(value)) return value
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length >= 16) return `data:image/png;base64,${value}`
  return value
}

// ---- business-token exchange (ZCode's normalizePolledTokenSet contract) ----

const businessLoginResponse = z.object({
  code: z.union([z.number(), z.string()]).optional(),
  success: z.boolean().optional(),
  msg: z.string().optional(),
  data: z.object({
    access_token: z.string().optional(),
    accessToken: z.string().optional(),
    expires_in: z.number().optional(),
  }).optional().nullable(),
})

export interface BusinessToken {
  token: string
  /** Epoch ms when the exchanged JWT expires, when the platform says. */
  expiresAt?: number
}

/**
 * Exchange a Z.AI OAuth access token for the platform business JWT that
 * Z.ai's business interfaces accept — the same `/api/auth/z/login` call
 * ZCode's desktop client performs at login before persisting the credential
 * (`zaiBusinessTokenResolver.ts`; the adapter comment is explicit that the
 * raw OAuth token is not what business endpoints take). Success codes are
 * 0/200 like every other biz envelope; a refusal surfaces as a transport
 * error so the sign-in flow can fail loud instead of storing a token that
 * only works until the first business read.
 */
export async function exchangeZaiBusinessToken(input: {
  token: string
  signal?: AbortSignal
}): Promise<BusinessToken> {
  const response = await fetch(`${ZAI_BIZ_ORIGIN}/api/auth/z/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ token: input.token.trim() }),
    ...input.signal === undefined ? {} : { signal: input.signal },
  })
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new PlatformRequestError(`Z.ai 凭据交换失败：HTTP ${String(response.status)}`, response.status)
  }
  const payload = businessLoginResponse.safeParse(await response.json())
  if (!payload.success) throw new PlatformRequestError('Z.ai 凭据交换失败：响应格式不正确。')
  const { code, success, data } = payload.data
  const refused = success === false
    || (typeof code === 'number' && code !== 0 && code !== 200)
    || (typeof code === 'string' && code !== '0' && code !== '200')
  const token = (data?.access_token ?? data?.accessToken)?.trim()
  if (refused || token === undefined || token === '') {
    throw new PlatformRequestError(`Z.ai 凭据交换失败：${payload.data.msg?.trim() || '平台拒绝该凭据。'}`)
  }
  const expiresIn = data?.expires_in
  return {
    token,
    ...(typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0
      ? { expiresAt: Date.now() + expiresIn * 1_000 }
      : {}),
  }
}

// ---- inference-key provisioning (the account manages its own API key) ------

/** BigModel's business-console origin the key provisioning talks to. */
export const BIGMODEL_BIZ_ORIGIN = 'https://bigmodel.cn'
/** Z.ai's business origin; the same biz API family lives on its API host. */
export const ZAI_BIZ_ORIGIN = 'https://api.z.ai'

/** The name a provisioned key carries in the console; reuse-if-exists keeps
 *  the provision idempotent across sign-ins and restarts. */
const PROVISIONED_KEY_NAME = 'dsh-glm-key'
const DEFAULT_ORG_NAME = '默认机构'
const DEFAULT_PROJECT_NAME = '默认项目'

export interface BizKeyOptions {
  /** Business-console origin, e.g. `https://bigmodel.cn`. */
  origin: string
  /** The OAuth access token the biz API authenticates. */
  token: string
  /** Z.ai wants the `Bearer` scheme on biz calls; BigModel takes the raw
   *  token (mirrors ZCode's own resolver). */
  bearer?: boolean
  signal: AbortSignal
}

interface BizEnvelope { code?: number | string; data?: unknown }
interface BizProject { projectId?: string; projectName?: string; projectType?: number | string | null }
interface BizOrganization { organizationId?: string; organizationName?: string; projects?: BizProject[] }
interface BizCustomerInfo { organizations?: BizOrganization[] }
interface BizApiKeySummary { apiKey?: string; name?: string }
interface BizApiKeySecret { secretKey?: string }

/** The biz envelope treats 0 and 200 as success (BigModel mixes both). */
function bizOk(code: unknown): boolean {
  if (code === null || code === undefined) return true
  if (typeof code === 'number') return code === 0 || code === 200
  if (typeof code === 'string') return code === '0' || code === '200'
  return false
}

async function bizRequest<T>(url: string, init: RequestInit, signal: AbortSignal): Promise<T | undefined> {
  const response = await fetch(url, { ...init, signal })
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    return undefined
  }
  const payload = await response.json().catch(() => undefined) as BizEnvelope | undefined
  if (payload === undefined || !bizOk(payload.code)) return undefined
  return (payload.data ?? undefined) as T | undefined
}

/**
 * Provision the platform's inference API key through the business console,
 * the way ZCode does: resolve the personal default organization/project,
 * reuse the plugin-owned key when it exists, create it when it does not, and
 * copy the secret half the wire auth needs. The chain is read-mostly and
 * idempotent; any failure returns `undefined` rather than throwing so a
 * sign-in never breaks on provisioning.
 * @returns the `{apiKey}.{secretKey}` inference key, or undefined.
 */
export async function resolveBizApiKey(options: BizKeyOptions): Promise<string | undefined> {
  const { origin, token, signal } = options
  const headers: Record<string, string> = {
    Authorization: options.bearer === true ? `Bearer ${token}` : token,
    'Content-Type': 'application/json',
  }
  try {
    const customer = await bizRequest<BizCustomerInfo>(
      `${origin}/api/biz/customer/getCustomerInfo`, { method: 'GET', headers }, signal)
    const orgs = (customer?.organizations ?? [])
      .map(organization => ({
        id: organization.organizationId?.trim() ?? '',
        name: organization.organizationName ?? '',
        projects: (organization.projects ?? [])
          .filter(project => String(project.projectType ?? '') !== '2')
          .map(project => ({ id: project.projectId?.trim() ?? '', name: project.projectName ?? '' }))
          .filter(project => project.id !== ''),
      }))
      .filter(organization => organization.id !== '' && organization.projects.length > 0)
    // Team projects are excluded above (projectType 2); a personal key can
    // only come from a personal one, default-named first.
    const organization = orgs.find(entry => entry.name.includes(DEFAULT_ORG_NAME)) ?? orgs[0]
    if (organization === undefined) return undefined
    const project = organization.projects.find(entry => entry.name.includes(DEFAULT_PROJECT_NAME))
      ?? organization.projects[0]
    if (project === undefined) return undefined

    const listUrl = `${origin}/api/biz/v1/organization/${organization.id}/projects/${project.id}/api_keys`
    const keys = await bizRequest<BizApiKeySummary[]>(listUrl, { method: 'GET', headers }, signal) ?? []
    let entry = keys.find(key => key.name === PROVISIONED_KEY_NAME)
    if (entry === undefined) {
      entry = await bizRequest<BizApiKeySummary>(
        listUrl, { method: 'POST', headers, body: JSON.stringify({ name: PROVISIONED_KEY_NAME }) }, signal)
    }
    const apiKeyId = entry?.apiKey?.trim() ?? ''
    if (apiKeyId === '') return undefined

    const secret = await bizRequest<BizApiKeySecret>(
      `${listUrl}/copy/${encodeURIComponent(apiKeyId)}`, { method: 'GET', headers }, signal)
    const secretKey = secret?.secretKey?.trim() ?? ''
    if (secretKey === '') return undefined
    return `${apiKeyId}.${secretKey}`
  } catch {
    return undefined
  }
}
