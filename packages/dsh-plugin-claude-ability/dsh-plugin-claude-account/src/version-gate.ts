/**
 * Upstream port-provenance gate.
 *
 * This account mirrors the official `@anthropic-ai/claude-code` CLI. The gate
 * fetches the upstream project's current version and compares it against the
 * version this port was made from; a drift means the wire protocol or the
 * login flow may have moved under us, so sign-in is refused and an existing
 * login is dropped until the plugin is re-synced with the new upstream. A
 * failed or timed-out check fails open — offline use must keep working.
 */

/** The upstream version this port was made from. */
export const LOCAL_VERSION = '2.1.303'

/** The upstream project, for display. */
export const UPSTREAM_LABEL = 'anthropics/claude-code'

/** The npm dist-tags document (smaller than the full registry manifest). */
const DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/@anthropic-ai%2Fclaude-code/dist-tags'
/** The dist-tag this port tracks. */
const DIST_TAG = 'latest'

const TIMEOUT_MS = 8_000

/** Normalize a version string for equality comparison: trim, drop a leading
 *  `v`, drop build metadata. */
export function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '').replace(/\+.*$/, '')
}

/** Fetch the upstream project's current version. Throws on any failure. */
export async function fetchUpstreamVersion(): Promise<string> {
  const response = await fetch(DIST_TAGS_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`HTTP ${String(response.status)}`)
  }
  const payload = await response.json() as Record<string, unknown>
  const version = payload[DIST_TAG] ?? payload['latest']
  if (typeof version !== 'string' || version === '') throw new Error('dist-tags 不含版本号')
  return version
}

/** The user-facing drift notice (the refusal and the auto-sign-out reason). */
export function driftMessage(local: string, upstream: string): string {
  return `上游 ${UPSTREAM_LABEL} 已更新到 v${normalizeVersion(upstream)}（本插件移植自 v${normalizeVersion(local)}），请更新插件后重新登录。`
}
