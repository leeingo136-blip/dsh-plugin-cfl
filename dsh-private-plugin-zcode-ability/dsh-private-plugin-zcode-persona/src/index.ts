/**
 * Persona component: the ZCode-flavoured working posture, contributed as one
 * prompt section inside the agent preset's scope.
 *
 * A section (not a `complete` prompt) on purpose: the preset adds a voice to
 * the deployment persona, it does not replace it. Scoped registration means
 * the text only reaches conversations that selected 「zCode之剑」.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-system-prompt'
import zschema from '@deepseek-ai/schemastery'

/** Wait for the prompt assembler before this row activates. */
export const inject = ['systemPrompt']

/** A volatile Config field arrives from schemastery as a frozen lazy box. */
export interface VolatileBox<T> {
  readonly get: () => T
}

export interface Config {
  /** Extra instructions appended after the built-in posture. */
  extra?: VolatileBox<string>
}

export const Config = zschema.object({
  extra: zschema.string().volatile(),
})

/** Prompt-section position: between the harness identity block (-1000) and
 *  the deployment persona (0), so a deployment persona still wins. */
const ORDER = -900

const SECTION_NAME = 'zcode-persona'

const POSTURE = [
  '你是 ZCode 之剑预设下的编码代理，工作方式遵循以下约定：',
  '- 先定位再动手：先用检索与阅读类工具确认事实，再给出结论或修改。',
  '- 改动前说明意图，改动后说明验证方式；不确定的地方直接说不确定。',
  '- 一次只推进一个可验证的变更，避免把多个互不相关的修改堆在一次提交里。',
  '- 引用代码时给出文件路径与行号，不凭记忆复述代码片段。',
  '- 与用户交互一律走 dsh 原生通道，不要用纯文本模拟界面元素：',
  '  - 需要用户做选择、确认或补充信息时，调用 ask_user_question 弹出选项（弹窗交互，不要在正文里罗列"1) … 2) …"式选项）；有推荐项就放首位并标注 (Recommended)。',
  '  - 告警与风险提示：需要用户决策的（继续/中止、接受风险/换方案）用 ask_user_question 给出明确选项；纯信息性的提醒写在回复正文，不要为此打断用户。',
  '  - 生成物展示：产出交付文件（文档、表格、幻灯片、可运行产物等）后，调用 present 把文件声明为交付物，由用户侧打开卡片查看；不要只贴路径或把整份产物粘进正文。',
].join('\n')

/**
 * Register the ZCode posture section.
 *
 * Deliberately a plain plugin, not a Service: it publishes nothing for other
 * rows to inject, and a Service would leak into the root realm, which the
 * preset mount refuses (see README, "Preset services require isolate realms").
 * @param ctx - preset scope. @param config - component configuration.
 */
export default function apply(ctx: Context, config: Config): void {
  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: ORDER,
    text: () => {
      const extra = config.extra?.get()?.trim()
      return extra === undefined || extra === '' ? POSTURE : `${POSTURE}\n${extra}`
    },
  }), 'zcode-persona: prompt section')
}
