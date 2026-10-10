/**
 * Shared context vocabulary for the zcode-ability components.
 *
 * Every component that injects model-visible text labels its producer, so the
 * derived history never renders a plugin reminder as if the user had typed it.
 * One declaration site keeps the vocabulary aligned across components.
 */

import type { ContextFormed } from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'zcode-ability': { kind: 'zcode-ability'; component: string } & ContextFormed
  }
}
