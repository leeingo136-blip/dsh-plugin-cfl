/**
 * Skills component: ZCode's "load a skill before you act" gate, expressed as
 * an advisory reminder on the tool pipeline.
 *
 * This is the one ZCode behaviour dsh has no equivalent for (`hasLoadedSkill`
 * in ZCode's workflow-skill gate). It is deliberately advisory, not a veto:
 * the gate in ZCode reminds too, and a `pre-execute` deny would read as a
 * blocked turn rather than a nudge (see the note in 14.3 of the migration
 * plan). The reminder rides `additionalContexts`, so it is attached to the
 * next request instead of being forged into the user's own turn.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { MessageSource, UserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-tools'
import type { PostToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import zschema from '@deepseek-ai/schemastery'
import type {} from './context.ts'

/** Wait for the tool pipeline before this row activates. */
export const inject = ['tools']

/** The official skill tool's name (`@deepseek-ai/dsh-tool-skill`). */
const SKILL_TOOL = 'skill'

/** Tools that count as "acting" — a reminder before these is worth sending. */
const ACTION_PATTERNS: readonly RegExp[] = [/^write/, /^edit/, /^patch/, /^bash/, /^run_/, /^exec/]

export interface VolatileBox<T> {
  readonly get: () => T
}

export interface Config {
  /** Acting calls tolerated before the reminder fires (default 2). */
  threshold?: VolatileBox<number>
  /** Extra tool names that count as acting. */
  actionTools?: VolatileBox<string[]>
}

export const Config = zschema.object({
  threshold: zschema.number().default(2).volatile(),
  actionTools: zschema.array(zschema.string()).default([]).volatile(),
})

const SOURCE: MessageSource = { kind: 'zcode-ability', component: 'skills' }

const REMINDER = '本次会话还没有加载任何技能。若当前任务属于某个已安装技能的领域，'
  + '先用 skill 工具加载它再继续；确认没有适用技能时可忽略本提示。'

/** Whether one tool name counts as acting, given the configured extras. */
function isActing(name: string, extras: readonly string[]): boolean {
  if (extras.includes(name)) return true
  return ACTION_PATTERNS.some(pattern => pattern.test(name))
}

/**
 * Watch acting calls and nudge once.
 *
 * A plain plugin rather than a Service: nothing injects it, and a Service
 * would publish into the root realm, which the preset mount rejects.
 * @param ctx - preset scope. @param config - component configuration.
 */
export default function apply(ctx: Context, config: Config): void {
  let skillLoaded = false
  let actingCalls = 0
  let reminded = false

  ctx.on('tools/post-execute', async (exec: ToolExecution, _result, next): Promise<PostToolDecision> => {
    if (exec.name === SKILL_TOOL) skillLoaded = true
    else if (isActing(exec.name, config.actionTools?.get() ?? [])) actingCalls += 1

    const downstream = await next()
    if (reminded || skillLoaded || actingCalls < (config.threshold?.get() ?? 2)) return downstream
    reminded = true
    const reminder: UserMessage = createUserMessage({
      content: [{ type: 'text', text: REMINDER }],
      source: { ...SOURCE, form: 'notice', summary: 'skill gate' },
    })
    if (downstream.kind === 'block') {
      return { kind: 'block', feedback: downstream.feedback, additionalContexts: [reminder, ...downstream.additionalContexts ?? []] }
    }
    return { ...downstream, additionalContexts: [reminder, ...downstream.additionalContexts ?? []] }
  })
}
