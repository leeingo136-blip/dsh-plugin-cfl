/**
 * The pi-ai glue this plugin needs, stated locally.
 *
 * Same architecture as the Z.ai account's bridge (`zai-account/pi-ai-bridge`):
 * `dsh-llm-pi-ai` serves the adapter and the wire, its published surface stops
 * at {@link PiAiAdapter}, and a hand-declared route builds its resolved
 * profile against pi-ai's public types. The protocol differs — this route
 * speaks `openai-completions` (DashScope's OpenAI-compatible endpoint),
 * because that is the wire the Qwen OAuth tokens are bound to.
 *
 * The auth story differs too: the credential is a rotating OAuth access
 * token, not a static key. The adapter's `resolveApiKey` override calls back
 * into the account service, which refreshes the token lazily before returning
 * it — the highest-priority auth pi-ai knows, so the collection-level store
 * has nothing stored and the ambient context answers "unset".
 *
 * @module qwen-account/pi-ai-bridge
 */

import type {
  Api, ApiKeyAuth, AuthContext, CredentialStore, Model, Provider, ProviderStreams,
} from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'

/** The defaults `dsh-llm-pi-ai` resolves for a profile that states none. */
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024
const DEFAULT_CONTEXT_WINDOW = 262_144
const DEFAULT_MAX_TOKENS = 32_768

/** The route prices nothing it reports: the absence of a fact, not a rate. */
const NO_COST: Model<Api>['cost'] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/** One adopted model entry: the fields the models page editor writes. */
export interface RouteModelSpec {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
}

/** The api-key auth of a harness-authenticated route: the token arrives per
 *  request as the `apiKey` override — for this account, the freshly refreshed
 *  OAuth access token. */
function harnessApiKeyAuth(name: string): ApiKeyAuth {
  return {
    name,
    resolve: ({ credential }) => Promise.resolve({
      auth: credential?.key === undefined ? {} : { apiKey: credential.key },
      source: name,
    }),
  }
}

/**
 * Build the resolved profile for the one OpenAI-compatible route the Qwen
 * OAuth tokens serve. Every default matches the harness resolver's.
 * @param input - the route's facts: identity, endpoint, credential reference
 *   name, and the adopted model catalog.
 * @returns the profile to hand {@link PiAiAdapter}.
 */
export function resolveOpenAiProfile(input: {
  provider: string
  displayName: string
  baseURL: string
  apiKeyEnv: string
  models: readonly RouteModelSpec[]
}): ResolvedPiAiProviderProfile {
  const api: ProviderStreams = openAICompletionsApi()
  const models: Model<Api>[] = input.models.map(model => ({
    id: model.id,
    name: model.name ?? model.id,
    api: 'openai-completions',
    provider: input.provider,
    baseUrl: input.baseURL,
    // The OAuth catalog's sole model is a hybrid reasoning model with vision;
    // reasoning levels are resolved server-side (no level map is declared).
    reasoning: true,
    input: ['text', 'image'],
    cost: NO_COST,
    contextWindow: model.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: model.maxTokens ?? DEFAULT_MAX_TOKENS,
  }))
  const provider: Provider = {
    id: input.provider,
    name: input.displayName,
    baseUrl: input.baseURL,
    auth: { apiKey: harnessApiKeyAuth(input.displayName) },
    getModels: () => models,
    stream: (model, context, options) => api.stream(model, context, options),
    streamSimple: (model, context, options) => api.streamSimple(model, context, options),
  }
  return {
    provider: input.provider,
    displayName: input.displayName,
    api: 'openai-completions',
    baseURL: input.baseURL,
    apiKeyEnv: input.apiKeyEnv as CredentialRef,
    streamIdleTimeoutMs: DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    maxRequestImageBytes: DEFAULT_MAX_REQUEST_IMAGE_BYTES,
    requestImagePixelBudget: DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: DEFAULT_REQUEST_IMAGE_MAX_BYTES,
    retryPolicy: resolveRetryPolicy(undefined, `qwen-account: provider "${input.provider}" retryPolicy`),
    piProvider: provider,
    modelErrors: new Map(),
    configuredMaxTokens: new Map(models
      .filter((_model, at) => input.models[at]?.maxTokens !== undefined)
      .map(model => [model.id, model.maxTokens])),
  }
}

/**
 * The collection-level credential store for this plugin's route: nothing is
 * ever stored here — the token rotates through the account service, not a
 * stored pi-ai credential.
 * @returns the empty store to hand {@link PiAiAdapter}.
 */
export function emptyCredentialStore(): CredentialStore {
  return {
    read: () => Promise.resolve(undefined),
    list: () => Promise.resolve([]),
    modify: () => Promise.reject(new LlmError(
      'Qwen 账号的路由通过按请求刷新的 OAuth 令牌鉴权，不存储 pi-ai 凭据。',
      'UNSTORABLE_PROVIDER_ID',
    )),
    delete: () => Promise.resolve(),
  }
}

/**
 * The ambient auth context for this plugin's route: no ambient discovery.
 * @returns the context to hand {@link PiAiAdapter}.
 */
export function staticAuthContext(): AuthContext {
  return {
    env: () => Promise.resolve(undefined),
    fileExists: () => Promise.resolve(false),
  }
}
