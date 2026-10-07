/**
 * The Qwen API-key protocol surface, stated locally.
 *
 * The OAuth device-authorization grant this module once mirrored (qwen-code
 * `packages/core/src/qwen/qwenOAuth2.ts`, Apache-2.0) is gone server-side:
 * Alibaba discontinued the Qwen OAuth free tier on 2026-04-15 — the
 * `/authorize` page now serves an app-download banner and the token endpoint
 * is behind an Aliyun WAF block rule answering 405. The account therefore
 * authenticates with a ModelStudio (百炼) API key against DashScope's
 * OpenAI-compatible endpoint, the exact replacement the official client
 * documents: domestic and international hosts share one wire shape, and the
 * Coding Plan's dedicated endpoint can be entered as a custom base URL.
 *
 * @module qwen-account/protocol
 */

/** DashScope OpenAI-compatible endpoint, domestic station. */
export const QWEN_BASE_URL_CN = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
/** DashScope OpenAI-compatible endpoint, international station. */
export const QWEN_BASE_URL_INTL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'

/** The ModelStudio console page where an API key is created (domestic). */
export const QWEN_CONSOLE_URL_CN = 'https://bailian.console.aliyun.com/?apiKey=1#/api-key'
/** The ModelStudio console page where an API key is created (international). */
export const QWEN_CONSOLE_URL_INTL = 'https://bailian.console.alibabacloud.com/?apiKey=1#/api-key'

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
