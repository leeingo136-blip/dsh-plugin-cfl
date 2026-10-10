/**
 * The Qwen Code preset component — `dsh-plugin-qwen-environment`.
 *
 * Same shape as the official `@deepseek-ai/dsh-agent-preset` entry and the
 * 「zCode之剑」 component: a config-driven service that hands the preset
 * definition to `agentPresets`. Declaring it under this package name is the
 * point — the preset becomes one component among this plugin's rather than a
 * single opaque block the container declares, and its capability list can be
 * amended by patching one row.
 *
 * Two ways to declare it exist and they are mutually exclusive:
 *
 * - **Declarative (default, recommended)**: one row in the container's
 *   `cordis.patch.yml` whose `name:` is this package and whose `config:` is
 *   the preset definition. Nothing here needs to be mounted.
 * - **Programmatic**: mount this entry with no config and the definition
 *   comes from `presetDefinition()` instead.
 *
 * Mounting both registers the same id twice and the registry rejects the
 * duplicate, so pick one.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { EntryGroup } from '@deepseek-ai/cordis-plugin-loader'
import z from '@deepseek-ai/schemastery'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { presetDefinition, resolvePresetPaths } from './definition.ts'

/** Definition submitted to the preset registry. */
export type Config = PresetDefinition

export default class QwenCodePreset {
  static inject = ['agentPresets']
  /** Preserve child expressions until their own plugins activate. */
  static readonly [EntryGroup.key] = true
  static Config: z<Config> = z.object({
    id: z.string().required(),
    name: z.string(),
    description: z.string(),
    order: z.number(),
    // Cordis owns individual plugin schemas; the registry validates entry structure.
    plugins: z.array(z.any()).required(),
  }) as z<Config>

  constructor(private readonly ctx: Context, private readonly config: Config = presetDefinition() as Config) {}

  async* [Service.init]() {
    // The declarative patch names container paths (e.g. `skills`) relative to
    // the container root because YAML has no module anchor; resolve them here,
    // on the host that owns the files, before handing the definition over.
    yield await this.ctx.agentPresets.register(resolvePresetPaths(this.config) as Config)
  }
}

export {
  PRESET_DESCRIPTION, PRESET_ID, PRESET_NAME, PRESET_ORDER, presetDefinition, presetPlugins,
} from './definition.ts'
