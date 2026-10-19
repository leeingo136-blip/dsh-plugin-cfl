/**
 * The pi-ai glue this plugin needs, stated locally.
 *
 * The harness's `dsh-llm-pi-ai` package serves the adapter and the wire, but
 * its published surface stops at {@link PiAiAdapter} — the profile resolver
 * and the auth bridges are internal. The pieces a hand-declared route needs
 * are small and fully described by public types, so they live here rather
 * than in a harness patch: one static Anthropic-protocol provider, the
 * resolved profile that presents it, and the two auth objects the adapter
 * requires.
 *
 * The auth objects are deliberately minimal, and honestly so: this account's
 * route always names a credential reference, so every request's key arrives
 * through the adapter's `resolveApiKey` as the request-level `apiKey`
 * override — the highest-priority auth pi-ai knows. The collection-level
 * store therefore has nothing stored (reads answer "nothing", writes refuse),
 * and the ambient context answers "unset": no provider on this route ever
 * performs ambient discovery.
 *
 * @module zai-account/pi-ai-bridge
 */

import type {
  Api, ApiKeyAuth, AuthContext, CredentialStore, Model, Provider, ProviderStreams,
  ThinkingLevelMap,
} from '@earendil-works/pi-ai'
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'

/** The defaults `dsh-llm-pi-ai` resolves for a profile that states none; the
 *  values are copied so a hand-built profile serves identical requests. */
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024
const DEFAULT_CONTEXT_WINDOW = 262_144
const DEFAULT_MAX_TOKENS = 32_768

/** The cost image of a route whose gateway prices nothing it reports: the
 *  absence of a fact, not a configurable rate. */
const NO_COST: Model<Api>['cost'] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/** GLM-5.3-Flash's three official reasoning-effort levels (`reasoning_effort:
 *  low | high | max`, default `max`). Every other pi-ai level is pinned
 *  unsupported: `medium` does not exist server-side — the template resolves
 *  any unrecognized value to `max` — and `off` is withheld because the model
 *  cannot stop thinking (a disabled request is served at the nearest level).
 *  The Anthropic gateway takes the effort through adaptive thinking's
 *  `output_config.effort`, so the models also declare
 *  `forceAdaptiveThinking`. */
const GLM_THINKING_LEVEL_MAP: ThinkingLevelMap = {
  off: null,
  minimal: null,
  low: 'low',
  medium: null,
  high: 'high',
  xhigh: null,
  max: 'max',
}

/** The client identity the gateway meteres token multipliers against. ZCode
 *  stamps every inference request with a self-describing header set
 *  (`bootstrap/src/model-config.ts`), and the account keys it mints carry no
 *  client identity of their own — the wire headers are the only signal. This
 *  route plays by the same convention with the constant identity fields only:
 *  the per-machine fingerprints (locale, timezone, platform, OS) vary by user
 *  and stay as the harness's own values. The identity lives on the route's
 *  model descriptors, so a request carries it exactly when it flows through
 *  this plugin's adapter — i.e. only when the conversation resolved to an
 *  API this account manages. */
const ZCODE_VERSION = '3.15.3'
const ZCODE_IDENTITY_HEADERS: Record<string, string> = {
  'HTTP-Referer': 'https://zcode.z.ai',
  'User-Agent': `ZCode/${ZCODE_VERSION}`,
  'X-ZCode-App-Version': ZCODE_VERSION,
  'X-Title': 'Z Code@cli',
  'X-ZCode-Agent': 'glm',
  'X-Release-Channel': 'production',
}

/** One adopted model entry: the fields the models page editor writes. */
export interface RouteModelSpec {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
}

/** The api-key auth of a harness-authenticated route: the key itself arrives
 *  per request as the `apiKey` override, which pi-ai presents here as the
 *  request's credential. */
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
 * Build the resolved profile for one Anthropic-protocol route: the static
 * single-protocol provider `dsh-llm-pi-ai` builds for a route its catalog
 * does not ship, plus the validated-profile fields the adapter reads. Every
 * default matches the harness resolver's, so requests are identical.
 * @param input - the route's facts: identity, endpoint, credential reference,
 *   and the adopted model catalog.
 * @returns the profile to hand {@link PiAiAdapter}.
 */
export function resolveAnthropicProfile(input: {
  provider: string
  displayName: string
  baseURL: string
  apiKeyEnv: string
  models: readonly RouteModelSpec[]
}): ResolvedPiAiProviderProfile {
  const api: ProviderStreams = anthropicMessagesApi()
  const models: Model<Api>[] = input.models.map(model => ({
    id: model.id,
    name: model.name ?? model.id,
    api: 'anthropic-messages',
    provider: input.provider,
    baseUrl: input.baseURL,
    // GLM-5.3-Flash reasons always; the map offers exactly the gateway's
    // three official levels and the adaptive-thinking switch dispatches them
    // as `output_config.effort` on the wire.
    reasoning: true,
    thinkingLevelMap: GLM_THINKING_LEVEL_MAP,
    compat: { forceAdaptiveThinking: true },
    // Every request on this route identifies as the ZCode client — the
    // gateway's token multipliers key off these headers, not the key.
    headers: ZCODE_IDENTITY_HEADERS,
    input: ['text'],
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
    retryPolicy: resolveRetryPolicy(undefined, `zai-account: provider "${input.provider}" retryPolicy`),
    piProvider: provider,
    // Route default effort: the gateway's own default (`max`), sent
    // explicitly so a request that names no effort is deterministic.
    reasoning: 'max',
    modelErrors: new Map(),
    // Only a cap the route explicitly configured is a request default; the
    // catalog's `maxTokens` sizes the model and stops there.
    configuredMaxTokens: new Map(models
      .filter((_model, at) => input.models[at]?.maxTokens !== undefined)
      .map(model => [model.id, model.maxTokens])),
  }
}

/**
 * The collection-level credential store for this plugin's routes. The route
 * authenticates through the injected key, so nothing is ever stored here; a
 * write would mean some flow tried to persist a pi-ai credential this
 * account never issues, and it fails loud rather than pretending.
 * @returns the empty store to hand {@link PiAiAdapter}.
 */
export function emptyCredentialStore(): CredentialStore {
  return {
    read: () => Promise.resolve(undefined),
    list: () => Promise.resolve([]),
    modify: () => Promise.reject(new LlmError(
      'Z.ai 账号的路由通过注入的 API Key 鉴权，不存储 pi-ai 凭据。',
      'UNSTORABLE_PROVIDER_ID',
    )),
    delete: () => Promise.resolve(),
  }
}

/**
 * The ambient auth context for this plugin's routes: no provider on this
 * route performs ambient discovery, so every lookup honestly answers "unset".
 * @returns the context to hand {@link PiAiAdapter}.
 */
export function staticAuthContext(): AuthContext {
  return {
    env: () => Promise.resolve(undefined),
    fileExists: () => Promise.resolve(false),
  }
}
