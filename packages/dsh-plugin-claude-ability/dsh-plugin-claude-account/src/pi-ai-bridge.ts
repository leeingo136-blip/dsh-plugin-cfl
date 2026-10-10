/**
 * The pi-ai glue this plugin needs, stated locally.
 *
 * Same architecture as the Qwen/Codex accounts' bridges:
 * `dsh-llm-pi-ai` serves the adapter and the wire, its published surface
 * stops at {@link PiAiAdapter}, and a hand-declared route builds its
 * resolved profile against pi-ai's public types. The route speaks
 * `anthropic-messages` — the wire both Claude auth modes serve:
 *
 * - **Claude subscription (OAuth)**: the access token carries the
 *   `sk-ant-oat01-` prefix, which pi-ai recognizes and sends as
 *   `Authorization: Bearer` with the Claude Code identity headers
 *   (`claude-cli/<version>` UA, `x-app: cli`, the "You are Claude Code"
 *   identity system block). The route additionally stamps the OAuth beta
 *   header the subscription surface requires onto every model it declares.
 * - **Anthropic Console API key**: a plain key — the SDK sends it as
 *   `x-api-key`; no extra headers.
 *
 * The bearer credential still flows through the adapter's `resolveApiKey`
 * override — the highest-priority auth pi-ai knows — so the collection-level
 * store has nothing stored.
 *
 * @module claude-account/pi-ai-bridge
 */

import type {
  Api, ApiKeyAuth, AuthContext, CredentialStore, Model, Provider, ProviderStreams,
} from '@earendil-works/pi-ai'
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'

/** The defaults `dsh-llm-pi-ai` resolves for a profile that states none. */
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024
const DEFAULT_CONTEXT_WINDOW = 200_000
const DEFAULT_MAX_TOKENS = 64_000

/** The route prices nothing it reports: the absence of a fact, not a rate. */
const NO_COST: Model<Api>['cost'] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/** One adopted model entry: the fields the models page editor writes. */
export interface RouteModelSpec {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
}

/** The api-key auth of a harness-authenticated route: the credential arrives
 *  per request as the `apiKey` override — for this account, the OAuth access
 *  token (lazily refreshed) or the pasted Console key. */
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
 * Build the resolved profile for the one anthropic-messages route the
 * account serves. Every default matches the harness resolver's.
 * @param input - the route's facts: identity, endpoint, credential reference
 *   name, the adopted model catalog, and the extra headers the wire requires
 *   (the OAuth beta header for the subscription mode; empty otherwise).
 * @returns the profile to hand {@link PiAiAdapter}.
 */
export function resolveAnthropicMessagesProfile(input: {
  provider: string
  displayName: string
  baseURL: string
  apiKeyEnv: string
  models: readonly RouteModelSpec[]
  headers: Readonly<Record<string, string>>
}): ResolvedPiAiProviderProfile {
  const api: ProviderStreams = anthropicMessagesApi()
  const models: Model<Api>[] = input.models.map(model => ({
    id: model.id,
    name: model.name ?? model.id,
    api: 'anthropic-messages',
    provider: input.provider,
    baseUrl: input.baseURL,
    // Extended-thinking models throughout; the effort level maps to the
    // thinking budget per call.
    reasoning: true,
    input: ['text', 'image'],
    ...(Object.keys(input.headers).length > 0 ? { headers: { ...input.headers } } : {}),
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
    api: 'anthropic-messages',
    baseURL: input.baseURL,
    apiKeyEnv: input.apiKeyEnv as CredentialRef,
    streamIdleTimeoutMs: DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    maxRequestImageBytes: DEFAULT_MAX_REQUEST_IMAGE_BYTES,
    requestImagePixelBudget: DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: DEFAULT_REQUEST_IMAGE_MAX_BYTES,
    retryPolicy: resolveRetryPolicy(undefined, `claude-account: provider "${input.provider}" retryPolicy`),
    piProvider: provider,
    modelErrors: new Map(),
    configuredMaxTokens: new Map(models
      .filter((_model, at) => input.models[at]?.maxTokens !== undefined)
      .map(model => [model.id, model.maxTokens])),
  }
}

/**
 * The collection-level credential store for this plugin's route: nothing is
 * ever stored here — the credential flows through the account service, not a
 * stored pi-ai credential.
 * @returns the empty store to hand {@link PiAiAdapter}.
 */
export function emptyCredentialStore(): CredentialStore {
  return {
    read: () => Promise.resolve(undefined),
    list: () => Promise.resolve([]),
    modify: () => Promise.reject(new LlmError(
      'Claude 账号的路由通过账号服务的凭证（OAuth 令牌或 API Key）鉴权，不存储 pi-ai 凭据。',
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
