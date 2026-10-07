/**
 * The `accountProvider` provider flag is a private-harness extension of the
 * official `LlmConfigurableProvider` (the stock npm type predates it): an
 * account-backed route's availability rides a sign-in rather than a stored
 * key, so configuration surfaces derive its visibility from the live model
 * catalog instead of the presence of its settings section.
 */
import '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm' {
  interface LlmConfigurableProvider {
    accountProvider?: boolean
  }
}
