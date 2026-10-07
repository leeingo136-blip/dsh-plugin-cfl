/**
 * Definition of the Codex preset — the programmatic path.
 *
 * `presetPlugins()` mirrors the container's `cordis.patch.yml`. The
 * declarative patch is the source of truth for an installed deployment; this
 * list exists for the programmatic path (mount this package's entry and the
 * preset is registered in code). Change one, change the other.
 *
 * ⚠️ A preset is a COMPLETE capability tree, not a patch on another one:
 * choosing it replaces the selected preset's tree, so the official entries are
 * restated here (mirroring the standard preset, as the zCode preset does).
 * Only session-level capabilities belong in it; install-level pieces (the
 * Codex account component) mount from the deployment patch, because putting
 * them here would make them vanish when another preset is selected.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The ported Codex skills tree is mounted via the container-relative
 * `customSkillDirs: ['skills']` entry; the environment component resolves it
 * against the container root at register time.
 */

/** This package's dist directory — the anchor for container-relative paths. */
const PACKAGE_DIST = dirname(fileURLToPath(import.meta.url))

/** Is the path already device-specific (POSIX absolute or Windows drive)? */
function isAbsoluteish(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[/\\]/.test(path)
}

/**
 * Resolve relative `customSkillDirs` entries against the container root.
 *
 * The declarative patch cannot use `import.meta.url`, so it names container
 * paths relative to the container root (e.g. `skills`). Absolute entries —
 * including the programmatic path's `SKILL_ROOT` — pass through untouched.
 * Must run on the host that owns the files, hence here and not in the YAML.
 */
export function resolvePresetPaths(config: unknown): unknown {
  if (config === null || typeof config !== 'object') return config
  const cloned = structuredClone(config) as {
    plugins?: { config?: { customSkillDirs?: string[] } }[]
  }
  for (const entry of cloned.plugins ?? []) {
    const dirs = entry.config?.customSkillDirs
    if (!Array.isArray(dirs)) continue
    entry.config!.customSkillDirs = dirs.map((dir) =>
      isAbsoluteish(dir) ? dir : join(PACKAGE_DIST, '../..', dir),
    )
  }
  return cloned
}

/**
 * One per ported capability — a component package name, mounted under its own
 * `codex-*` cell in the preset tree.
 */
const COMPONENT = {
  persona: 'dsh-private-plugin-codex-persona',
  loop: 'dsh-private-plugin-codex-loop',
} as const

/** The preset this component contributes. */
export const PRESET_ID = 'codex'
/** Display name of the contributed preset (any characters; not an identifier). */
export const PRESET_NAME = 'Codex'
/** Sort weight: negative claims a fixed place ahead of the shipped presets. */
export const PRESET_ORDER = -8
/** Description as declared in the patch row. */
export const PRESET_DESCRIPTION =
  'Codex 工作方式。标准能力 + Codex 的会话内能力（移植系统提示词 / loop 定时器与四工具 / 移植技能树）'

/** One entry inside a preset's plugin tree. */
export interface PresetPluginEntry {
  id: string
  name: string
  disabled?: boolean
  group?: boolean
  /** Isolate flags: every value is `true` in practice (the loader types it as
   *  `string | true`). */
  isolate?: Readonly<Record<string, true>>
  config?: unknown
}

/** The preset's capability tree. */
export function presetPlugins(): readonly PresetPluginEntry[] {
  return [
    { id: 'persona', name: '@deepseek-ai/dsh-persona', config: {
      // Codex's identity sentence, adapted to the harness host.
      prefix: 'You are Codex, a coding agent powered by the {{model}} model.',
      suffix: 'Your working directory is {{cwd}}.',
    } },
    { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
    // --- Codex: the ported core-mandates posture ---
    { id: 'codex-persona', name: COMPONENT.persona, config: {} },
    { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', disabled: process.platform === 'win32' },
    { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', disabled: process.platform !== 'win32' },
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
    { id: 'tool-fs-search', name: '@deepseek-ai/dsh-tool-fs-search', config: { sampleOverCapGlobResults: false } },
    { id: 'tool-jobs', name: '@deepseek-ai/dsh-tool-jobs' },
    // The ported skill tree: harness ships its own skills (bundled, user,
    // project), so only the Codex-derived ones are added here as an extra
    // root. Container-relative: the environment component resolves
    // non-absolute entries against the container root at register time.
    { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem', config: { customSkillDirs: ['skills'] } },
    { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
    // --- Codex: the loop scheduler and its four tools ---
    { id: 'codex-loop', name: COMPONENT.loop, config: {} },
    { id: 'command-goal', name: '@deepseek-ai/dsh-command-goal' },
    { id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' },
    { id: 'planning', name: 'cordis:group', group: true, isolate: { planMode: true }, config: [
      { id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode' },
    ] },
    { id: 'compaction', name: 'cordis:group', group: true, isolate: { compaction: true, toolResultPruner: true }, config: [
      { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
      { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
      { id: 'tool-result-pruner', name: '@deepseek-ai/dsh-compaction-tool-result-pruner', config: {
        thresholdChars: 8192, headChars: 4096, tailChars: 1024,
      } },
    ] },
    { id: 'delegation', name: 'cordis:group', group: true, isolate: { workflowEngine: true }, config: [
      { id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control' },
      { id: 'tool-subagent-list-agents', name: '@deepseek-ai/dsh-tool-subagent-control/list-agents' },
      { id: 'tool-subagent', name: '@deepseek-ai/dsh-tool-subagent', config: {
        provider: 'spawn', toolName: 'subagent', modelSelectionSettings: true, backgroundMode: 'continuable',
      } },
      { id: 'workflow-ptc', name: '@deepseek-ai/dsh-workflow-ptc', config: { provider: 'spawn' } },
      { id: 'tool-workflow', name: '@deepseek-ai/dsh-tool-workflow' },
    ] },
    { id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' },
    { id: 'tool-todo', name: '@deepseek-ai/dsh-tool-todo', config: { allowParallelInProgress: true } },
    { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', config: { fetch: true, searchTimeoutMs: 60000 } },
    { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
  ]
}

/** The preset definition itself, for the programmatic path. */
export function presetDefinition() {
  return {
    id: PRESET_ID,
    name: PRESET_NAME,
    description: PRESET_DESCRIPTION,
    order: PRESET_ORDER,
    plugins: [...presetPlugins()],
  }
}
