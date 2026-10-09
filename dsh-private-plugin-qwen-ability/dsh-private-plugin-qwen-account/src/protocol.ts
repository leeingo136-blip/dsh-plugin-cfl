/**
 * The Qwen API-key protocol surface, stated locally.
 *
 * The OAuth device-authorization grant this module once mirrored (qwen-code
 * `packages/core/src/qwen/qwenOAuth2.ts`, Apache-2.0) is gone server-side:
 * Alibaba discontinued the Qwen OAuth free tier on 2026-04-15 — the
 * `/authorize` page now serves an app-download banner and the token endpoint
 * is behind an Aliyun WAF block rule answering 405. The account therefore
 * authenticates the way current qwen-code does: a ModelStudio (百炼) key
 * pasted against the endpoint tier it was issued for — Coding Plan, Token
 * Plan, or the plain DashScope compatible-mode endpoint.
 *
 * The tier is addressed as a (plan, region) pair — the same two-step choice
 * qwen-code's /auth wizard makes (provider, then region). The base URL is
 * fixed by the pair; only the custom-provider escape hatch takes a free URL.
 *
 * @module qwen-account/protocol
 */

/** DashScope OpenAI-compatible endpoint, domestic station. */
export const QWEN_BASE_URL_CN = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
/** DashScope OpenAI-compatible endpoint, international station. */
export const QWEN_BASE_URL_INTL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'

/** The subscription tier families, mirroring qwen-code's provider table. */
export type PlanId = 'coding-plan' | 'token-plan' | 'dashscope'
/** The station the plan's key is issued for. */
export type RegionId = 'cn' | 'intl'

/**
 * One endpoint preset: a (plan, region) pair with the base URL it binds and
 * the ModelStudio console page where that tier's key is created.
 */
export interface EndpointPreset {
  readonly plan: PlanId
  readonly region: RegionId
  readonly planLabel: string
  readonly regionLabel: string
  readonly baseUrl: string
  readonly consoleUrl: string
}

// Aliyun's China console lives under *.console.aliyun.com (console.aliyuncs.com
// does not resolve); the international one is *.console.alibabacloud.com.
const CONSOLE_CN = 'https://bailian.console.aliyun.com/?apiKey=1#/api-key'
const CONSOLE_INTL = 'https://bailian.console.alibabacloud.com/?apiKey=1#/api-key'

export const ENDPOINT_PRESETS: readonly EndpointPreset[] = [
  {
    plan: 'coding-plan', region: 'cn', planLabel: 'Coding Plan', regionLabel: '北京',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1', consoleUrl: CONSOLE_CN,
  },
  {
    plan: 'coding-plan', region: 'intl', planLabel: 'Coding Plan', regionLabel: '新加坡',
    baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1', consoleUrl: CONSOLE_INTL,
  },
  {
    plan: 'token-plan', region: 'cn', planLabel: 'Token Plan', regionLabel: '北京',
    baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', consoleUrl: CONSOLE_CN,
  },
  {
    plan: 'token-plan', region: 'intl', planLabel: 'Token Plan', regionLabel: '新加坡',
    baseUrl: 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1', consoleUrl: CONSOLE_INTL,
  },
  {
    plan: 'dashscope', region: 'cn', planLabel: 'DashScope 兼容模式', regionLabel: '国内',
    baseUrl: QWEN_BASE_URL_CN, consoleUrl: CONSOLE_CN,
  },
  {
    plan: 'dashscope', region: 'intl', planLabel: 'DashScope 兼容模式', regionLabel: '国际',
    baseUrl: QWEN_BASE_URL_INTL, consoleUrl: CONSOLE_INTL,
  },
]

/** Look up the preset for a (plan, region) pair; undefined when unknown. */
export function findPreset(plan: string, region: string): EndpointPreset | undefined {
  return ENDPOINT_PRESETS.find(preset => preset.plan === plan && preset.region === region)
}

/** The display label of a preset: 「套餐 · 区域」. */
export function presetLabel(preset: EndpointPreset): string {
  return `${preset.planLabel} · ${preset.regionLabel}`
}

const REQUEST_TIMEOUT_MS = 30_000

/** Probe the model catalog the key can serve (`GET /models`). */
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
