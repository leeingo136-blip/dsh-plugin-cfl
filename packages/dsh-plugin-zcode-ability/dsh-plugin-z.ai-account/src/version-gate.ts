/**
 * Upstream port-provenance gate.
 *
 * This account mirrors the official ZCode desktop client (`zai-org/ZCode`).
 * The gate fetches the upstream repository's newest published tag and compares
 * it against the version this port was made from; a drift means the login
 * protocol or the identity headers may have moved under us, so sign-in is
 * refused and an existing login is dropped until the plugin is re-synced with
 * the new upstream. A failed or timed-out check fails open — offline use must
 * keep working.
 *
 * Note the source is the GitHub tag list, not the desktop release feed: the
 * vendor ships desktop builds ahead of (or without) GitHub releases, and the
 * tags are the only versioned public trace this gate can compare against.
 */

/** The upstream version this port was made from. */
export const LOCAL_VERSION = '3.15.1'

/** The upstream project, for display. */
export const UPSTREAM_LABEL = 'zai-org/ZCode'

const TAGS_URL = 'https://api.github.com/repos/zai-org/ZCode/tags?per_page=1'

const TIMEOUT_MS = 8_000

/** Normalize a version string for equality comparison: trim, drop a leading
 *  `v`, drop build metadata. */
export function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '').replace(/\+.*$/, '')
}

/** Fetch the upstream repository's newest tag. Throws on any failure. */
export async function fetchUpstreamVersion(): Promise<string> {
  const response = await fetch(TAGS_URL, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-plugin-zai-account' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`HTTP ${String(response.status)}`)
  }
  const payload = await response.json() as unknown
  const name = Array.isArray(payload) && typeof payload[0] === 'object' && payload[0] !== null
    ? (payload[0] as { name?: unknown }).name
    : undefined
  if (typeof name !== 'string' || name === '') throw new Error('响应不含 tag')
  return name
}

/** The user-facing drift notice (the refusal and the auto-sign-out reason). */
export function driftMessage(local: string, upstream: string): string {
  return `上游 ${UPSTREAM_LABEL} 已更新到 v${normalizeVersion(upstream)}（本插件移植自 v${normalizeVersion(local)}），请更新插件后重新登录。`
}
