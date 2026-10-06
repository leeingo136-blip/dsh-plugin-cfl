/**
 * Workflow component: the ZCode habit of writing a multi-step procedure down
 * before running it, contributed as a scoped prompt section.
 *
 * dsh's own workflow tooling (`dsh-workflow` / `workflow-ptc` / `tool-ralph`)
 * is listed by the preset itself; this section only asks the model to reach
 * for those rather than improvising an ad-hoc chain of calls.
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
  /** Extra workflow instructions appended after the built-in text. */
  extra?: VolatileBox<string>
}

export const Config = zschema.object({
  extra: zschema.string().volatile(),
})

/** Beside the plan section, after the plan policy block. */
const ORDER = 530

const SECTION_NAME = 'zcode-workflow'

const TEXT = [
  '工作流：',
  '- 多步骤、可重复的任务优先写成工作流或循环执行，而不是逐轮手工推进。',
  '- 工作流每一步要能独立验证：失败时保留前一步的成果，不整体回滚。',
  '- 需要长时间推进时，明确说明当前进度与下一步。',
].join('\n')

/**
 * Register the workflow-discipline section.
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
  }), 'zcode-workflow: prompt section')
}
