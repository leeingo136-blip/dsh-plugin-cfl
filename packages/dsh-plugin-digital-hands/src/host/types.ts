/**
 * Shared wire types between the Digital Hands host services and the settings
 * UI. The remote boundary is `src-json` (no schema validation), so these are
 * documentation-grade contracts; both sides keep field names in sync by hand.
 */

/** One tool entry as the settings UI renders it inside a source group. */
export interface DhToolRow {
  /** Public tool name (what the model calls). */
  name: string
  description: string
  /** Whether extended usage docs exist in the plan (script tools only). */
  hasDocs?: boolean
}

/**
 * One source group of the tool list: every tool the host sees, attributed to
 * the thing that provides it — a managed MCP server, Digital Hands itself,
 * a first-party (official) tool plugin, or an unattributed third-party one.
 */
export interface DhToolGroup {
  origin: 'self' | 'mcp' | 'official' | 'third-party'
  /** Display name: plugin title or MCP server name. */
  title: string
  /** Small print: package name or the MCP server's address/command. */
  subtitle: string
  tools: DhToolRow[]
}

/** One managed MCP server's live status. */
export interface DhMcpStatus {
  name: string
  state: 'idle' | 'connected' | 'failed'
  tools: number
  failure?: string
}

/** One plan file as the settings UI lists it. */
export interface DhPlanView {
  /** File stem (without `.yml`). */
  name: string
  yaml: string
  /** Whether this plan is among the ones mounted in this App run. */
  active: boolean
  servers: number
  scripts: number
}

/** Aggregate status payload for the UI header. */
export interface DhStatus {
  mcp: DhMcpStatus[]
  activePlans: string[]
  managedTools: number
}

/** Result of a probe (connect + list tools + close) against one server spec. */
export interface DhProbeResult {
  ok: boolean
  tools?: string[]
  error?: string
}
