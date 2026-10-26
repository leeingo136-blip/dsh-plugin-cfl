/** 心灵回响的插件快照消息：模型可见、UI 折叠，不改写真实用户发言。 */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'plugin:memory-echo': { kind: 'plugin:memory-echo' } & ContextFormed
  }
}

export const PLUGIN_KIND = 'plugin:memory-echo' as const

/** 构造一条“前置会话”快照消息。 */
export function createSnapshotMessage(title: string, text: string) {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: {
      kind: PLUGIN_KIND,
      form: 'snapshot',
      sections: [{ name: title, text }],
    },
  })
}
