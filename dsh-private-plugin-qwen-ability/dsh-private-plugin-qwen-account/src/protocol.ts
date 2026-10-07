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
 * @module qwen-account/protocol
 */

/** DashScope OpenAI-compatible endpoint, domestic station. */
export const QWEN_BASE_URL_CN = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
/** DashScope OpenAI-compatible endpoint, international station. */
export const QWEN_BASE_URL_INTL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'

/**
 * The endpoint presets, mirroring qwen-code's official provider table
 * (`docs/users/configuration/auth.md`): one subscription tier per endpoint,
 * and the key belongs to the endpoint it was issued for. The console URL is
 * the ModelStudio page where that tier's key is created, split by region.
 */
export interface EndpointPreset {
  readonly label: string
  readonly baseUrl: string
  readonly consoleUrl: string
}

const CONSOLE_CN = 'https://bailian.console.aliyuncs.com/?apiKey=1#/api-key'
const CONSOLE_INTL = 'https://bailian.console.alibabacloud.com/?apiKey=1#/api-key'

export const ENDPOINT_PRESETS: readonly EndpointPreset[] = [
  { label: 'Coding Plan（北京）', baseUrl: 'https://coding.dashscope.aliyuncs.com/v1', consoleUrl: CONSOLE_CN },
  { label: 'Coding Plan（国际）', baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1', consoleUrl: CONSOLE_INTL },
  { label: 'Token Plan（北京）', baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', consoleUrl: CONSOLE_CN },
  { label: 'Token Plan（新加坡）', baseUrl: 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1', consoleUrl: CONSOLE_INTL },
  { label: 'DashScope 兼容模式（国内）', baseUrl: QWEN_BASE_URL_CN, consoleUrl: CONSOLE_CN },
  { label: 'DashScope 兼容模式（国际）', baseUrl: QWEN_BASE_URL_INTL, consoleUrl: CONSOLE_INTL },
]

/** The preset labels, in schema order. */
export const ENDPOINT_LABELS: readonly string[] = ENDPOINT_PRESETS.map(preset => preset.label)

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
