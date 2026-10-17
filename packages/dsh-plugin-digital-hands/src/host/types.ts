/**
 * Shared wire types between the Digital Hands host services and the settings
 * UI. The remote boundary is `src-json` (no schema validation), so these are
 * documentation-grade contracts; both sides keep field names in sync by hand.
 */

/** One row of the tool catalog as the settings UI renders it. */
export interface DhToolRow {
  /** Public tool name (what the model calls). */
  name: string
  description: string
  /** Where the tool came from. */
  origin: 'native' | 'mcp' | 'script'
  /** MCP only: the server that provided it. */
  server?: string
  /** Whether extended usage docs exist in the plan. */
  hasDocs?: boolean
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
