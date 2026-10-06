/**
 * Plan component: the planning discipline ZCode's plan mode enforces,
 * contributed as a scoped prompt section.
 *
 * It states the expectation instead of building a second planner: dsh already
 * ships `plan-mode`, `tool-todo` and `goal`, and the preset lists them. This
 * section only tells the model to prefer those over improvising — a文案-level
 * difference, which is exactly where ZCode's plan behaviour lives.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-system-prompt'
import zschema from '@deepseek-ai/schemastery'

/** Wait for the prompt assembler before this row activates. */
export const inject = ['systemPrompt']

export interface VolatileBox<T> {
  readonly get: () => T
}

export interface Config {
  /** Extra planning instructions appended after the built-in text. */
  extra?: VolatileBox<string>
}

export const Config = zschema.object({
  extra: zschema.string().volatile(),
})

/** Just before the tool sections (tool-bash starts at 1000), so the plan
 *  guidance reads as policy rather than as a tool description. */
const ORDER = 520

const SECTION_NAME = 'zcode-plan'

const TEXT = [
  '计划与推进：',
  '- 超过三个步骤的任务，先把步骤写进计划/待办再动手，并在推进中更新状态。',
  '- 遇到与预期不符的结果，先重新确认前置假设，再继续下一步。',
  '- 任务完成前明确说明验证方式与未覆盖的部分。',
].join('\n')

/**
 * Register the planning-discipline section.
 *
 * A plain plugin rather than a Service: nothing injects it, and a Service
 * would publish into the root realm, which the preset mount rejects.
 * @param ctx - preset scope. @param config - component configuration.
 */
export default function apply(ctx: Context, config: Config): void {
  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: ORDER,
    text: () => {
      const extra = config.extra?.get()?.trim()
      return extra === undefined || extra === '' ? TEXT : `${TEXT}\n${extra}`
    },
  }), 'zcode-plan: prompt section')
}
