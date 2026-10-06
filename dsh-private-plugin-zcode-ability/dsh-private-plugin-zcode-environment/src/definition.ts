/**
 * Definition of the 「zCode之剑」 preset — the programmatic path.
 *
 * `presetPlugins()` mirrors the container's `cordis.patch.yml`. The declarative
 * patch is the source of truth for an installed deployment; this list exists
 * for the programmatic path (mount this package's entry and the preset is
 * registered in code). Change one, change the other.
 *
 * ⚠️ A preset is a COMPLETE capability tree, not a patch on another one:
 * choosing it replaces the selected preset's tree, so the official entries are
 * restated here. Only session-level capabilities belong in it; install-level
 * pieces (the account component) mount from the deployment patch, because
 * putting them here would make them vanish when another preset is selected.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The ported ZCode skills tree, mounted as an extra skill root.
 *
 * Resolved from this package, not from a shared constant: each capability is
 * its own component package, so the preset must not depend on any of them.
 * This package sits one level under the container, so the tree is
 * `<this package>/../../skills`.
 */
const SKILL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../skills')

/**
 * One per ported capability — a component package name, mounted under its own
 * `zcode-*` cell in the preset tree.
 */
const COMPONENT = {
  persona: 'dsh-private-plugin-zcode-persona',
  skills: 'dsh-private-plugin-zcode-skills',
  tools: 'dsh-private-plugin-zcode-tools',
  plan: 'dsh-private-plugin-zcode-plan',
  workflow: 'dsh-private-plugin-zcode-workflow',
} as const

/** The preset this component contributes. */
export const PRESET_ID = 'zcode-sword'
/** Display name of the contributed preset (any characters; not an identifier). */
export const PRESET_NAME = 'zCode之剑'
/** Sort weight: negative claims a fixed place ahead of the shipped presets. */
export const PRESET_ORDER = -10
/** Description as declared in the patch row. */
export const PRESET_DESCRIPTION =
  '屠龙者终成恶龙。标准能力 + ZCode 的会话内能力（提示词 / 技能门禁 / 工具策略 / 计划 / 工作流）'

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
      suffix: 'Your working directory is {{cwd}}.',
      prefix: 'You are a coding agent powered by the {{model}} model.',
    } },
    { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
    { id: 'zcode-persona', name: COMPONENT.persona, config: {} },
    { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', disabled: process.platform === 'win32' },
    { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', disabled: process.platform !== 'win32' },
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
    { id: 'tool-fs-search', name: '@deepseek-ai/dsh-tool-fs-search', config: { sampleOverCapGlobResults: false } },
    { id: 'tool-jobs', name: '@deepseek-ai/dsh-tool-jobs' },
    { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem', config: { customSkillDirs: [SKILL_ROOT] } },
    { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
    { id: 'zcode-skills', name: COMPONENT.skills, config: {} },
    { id: 'zcode-tools', name: COMPONENT.tools, config: {} },
    { id: 'command-goal', name: '@deepseek-ai/dsh-command-goal' },
    { id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' },
    { id: 'planning', name: 'cordis:group', group: true, isolate: { planMode: true }, config: [
      // The plan-mode section text is long and deployment-owned; the
      // declarative patch carries it verbatim. The programmatic path leaves it
      // to the plugin's own defaults.
      { id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode' },
      { id: 'zcode-plan', name: COMPONENT.plan, config: {} },
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
      { id: 'zcode-workflow', name: COMPONENT.workflow, config: {} },
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
