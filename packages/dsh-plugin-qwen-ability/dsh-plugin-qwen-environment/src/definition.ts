/**
 * Definition of the Qwen Code preset — the programmatic path.
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
 * Qwen account component) mount from the deployment patch, because putting
 * them here would make them vanish when another preset is selected.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The ported Qwen Code skills tree is mounted via the container-relative
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
 * `qwen-*` cell in the preset tree.
 */
const COMPONENT = {
  persona: 'dsh-plugin-qwen-persona',
  loop: 'dsh-plugin-qwen-loop',
} as const

/** The preset this component contributes. */
export const PRESET_ID = 'folding-fan'
/** Display name of the contributed preset (any characters; not an identifier). */
export const PRESET_NAME = 'Qwen的折扇'
/** Sort weight: negative claims a fixed place ahead of the shipped presets. */
export const PRESET_ORDER = -9
/** Description as declared in the patch row. */
export const PRESET_DESCRIPTION =
  'Qwen Code 工作方式。标准能力 + Qwen Code 的会话内能力（移植系统提示词 / loop 定时器与四工具 / 移植技能树）'

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

/**
 * Plan-mode posture, mirrored from the official standard preset: the plan-mode
 * plugin rejects an empty `section`, so every preset restating that row must
 * supply the same discipline text (see dsh-web-app presets/standard.patch.yml).
 */
export const PLAN_MODE_SECTION = `You are in plan mode. Stay in plan mode until exit_plan_mode succeeds or the user switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.

Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.

The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.

Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.

Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.

When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.`

/** The preset's capability tree. */
export function presetPlugins(): readonly PresetPluginEntry[] {
  return [
    { id: 'persona', name: '@deepseek-ai/dsh-persona', config: {
      // Qwen Code's identity sentence, adapted to the harness host.
      prefix: 'You are Qwen Code, a coding agent powered by the {{model}} model.',
      suffix: 'Your working directory is {{cwd}}.',
    } },
    { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
    // --- Qwen Code: the ported core-mandates posture ---
    { id: 'qwen-persona', name: COMPONENT.persona, config: {} },
    { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', disabled: process.platform === 'win32' },
    { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', disabled: process.platform !== 'win32' },
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
    { id: 'tool-fs-search', name: '@deepseek-ai/dsh-tool-fs-search', config: { sampleOverCapGlobResults: false } },
    { id: 'tool-jobs', name: '@deepseek-ai/dsh-tool-jobs' },
    // The ported skill tree: harness ships its own skills (bundled, user,
    // project), so only the Qwen Code-derived ones are added here as an extra
    // root. Container-relative: the environment component resolves
    // non-absolute entries against the container root at register time.
    { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem', config: { customSkillDirs: ['skills'] } },
    { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
    // --- Qwen Code: the loop scheduler and its four tools ---
    { id: 'qwen-loop', name: COMPONENT.loop, config: {} },
    { id: 'command-goal', name: '@deepseek-ai/dsh-command-goal' },
    { id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' },
    { id: 'planning', name: 'cordis:group', group: true, isolate: { planMode: true }, config: [
      { id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode', config: { section: PLAN_MODE_SECTION } },
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
      { id: 'tool-subagent-fork', name: '@deepseek-ai/dsh-tool-subagent', config: {
        provider: 'fork', toolName: 'subagent_fork', backgroundMode: 'continuable',
      } },
      { id: 'tool-subagent-codex', name: '@deepseek-ai/dsh-tool-subagent', disabled: true, config: {
        provider: 'codex', toolName: 'subagent_codex', backgroundMode: 'one-shot', maxDepth: 'provider-managed',
      } },
      { id: 'tool-subagent-claude-code', name: '@deepseek-ai/dsh-tool-subagent', disabled: true, config: {
        provider: 'claude-code', toolName: 'subagent_claude_code', backgroundMode: 'one-shot', maxDepth: 'provider-managed',
      } },
      { id: 'workflow-ptc', name: '@deepseek-ai/dsh-workflow-ptc', config: { provider: 'spawn' } },
      { id: 'tool-workflow', name: '@deepseek-ai/dsh-tool-workflow' },
      { id: 'tool-ralph', name: '@deepseek-ai/dsh-tool-ralph', disabled: true, config: {
        subagentProvider: 'spawn', maxRounds: 64,
      } },
    ] },
    { id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' },
    { id: 'tool-todo', name: '@deepseek-ai/dsh-tool-todo', config: { allowParallelInProgress: true } },
    { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', config: { fetch: true, searchTimeoutMs: 60000 } },
    { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
    { id: 'tool-plugin-manager', name: '@deepseek-ai/dsh-plugin-manager/tools', disabled: true },
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
