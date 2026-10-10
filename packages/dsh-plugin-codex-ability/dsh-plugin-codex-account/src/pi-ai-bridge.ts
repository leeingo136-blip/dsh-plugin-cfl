/**
 * The pi-ai glue this plugin needs, stated locally.
 *
 * Same architecture as the Qwen account's bridge (`qwen-account/pi-ai-bridge`):
 * `dsh-llm-pi-ai` serves the adapter and the wire, its published surface stops
 * at {@link PiAiAdapter}, and a hand-declared route builds its resolved
 * profile against pi-ai's public types. The protocol differs — this route
 * speaks `openai-responses`, the wire both Codex auth modes serve:
 * the ChatGPT subscription backend (`chatgpt.com/backend-api/codex/responses`)
 * and the Platform API (`api.openai.com/v1/responses`).
 *
 * Codex's backend requires its own attribution headers on subscription
 * requests (`originator`, `chatgpt-account-id`, a Codex-shaped User-Agent);
 * pi-ai merges per-model `headers` over its defaults, so the route stamps
 * them onto every model it declares. The bearer token still flows through
 * the adapter's `resolveApiKey` override — the highest-priority auth pi-ai
 * knows — so the collection-level store has nothing stored.
 *
 * @module codex-account/pi-ai-bridge
 */

import type {
  Api, ApiKeyAuth, AuthContext, CredentialStore, Model, Provider, ProviderStreams,
} from '@earendil-works/pi-ai'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import { LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'

/** The defaults `dsh-llm-pi-ai` resolves for a profile that states none. */
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024
const DEFAULT_CONTEXT_WINDOW = 272_000
const DEFAULT_MAX_TOKENS = 128_000

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
 *  token (lazily refreshed) or the pasted Platform key. */
function harnessApiKeyAuth(name: string): ApiKeyAuth {
  return {
    name,
    resolve: ({ credential }) => Promise.resolve({
      auth: credential?.key === undefined ? {} : { apiKey: credential.key },
      source: name,
    }),
  }
}

/** The Stainless telemetry headers the OpenAI Node SDK stamps on every
 *  request (`x-stainless-lang`, `x-stainless-runtime: node`, package
 *  version, …). The real Codex CLI is a Rust reqwest client and sends none
 *  of them — on this route they would contradict the `codex_cli_rs`
 *  User-Agent, so the wire wrapper below strips the whole family. */
const SDK_TELEMETRY_HEADER = /^x-stainless-/i

/**
 * Wrap one fetch so no `x-stainless-*` header reaches the wire. The SDK
 * calls the injected fetch as `(url, init)` with the merged headers on the
 * init, so rebuilding the init's `Headers` is enough.
 * @param inner - the caller-supplied fetch to chain, if any.
 * @returns the wrapper to hand the adapter.
 */
function telemetryFreeFetch(inner?: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init !== undefined && init.headers !== undefined) {
      const headers = new Headers(init.headers)
      for (const name of [...headers.keys()]) {
        if (SDK_TELEMETRY_HEADER.test(name)) headers.delete(name)
      }
      init = { ...init, headers }
    }
    return await (inner ?? fetch)(input, init)
  }) as typeof fetch
}

/** The stream options the provider closures receive, narrowed to the one
 *  field the wrapper needs (pi-ai forwards `fetch` into the OpenAI client). */
interface WireOptions {
  fetch?: typeof fetch
}

/** Stamp the telemetry-stripping wire onto one stream call's options. */
function withCleanWire<T extends WireOptions | undefined>(options: T): T {
  if (options === undefined) return options
  return { ...options, fetch: telemetryFreeFetch(options.fetch) } as T
}

/**
 * Build the resolved profile for the one Responses route the account serves.
 * Every default matches the harness resolver's.
 * @param input - the route's facts: identity, endpoint, credential reference
 *   name, the adopted model catalog, and the attribution headers the wire
 *   requires (empty for the Platform API-key mode).
 * @returns the profile to hand {@link PiAiAdapter}.
 */
export function resolveOpenAiResponsesProfile(input: {
  provider: string
  displayName: string
  baseURL: string
  apiKeyEnv: string
  models: readonly RouteModelSpec[]
  headers: Readonly<Record<string, string>>
}): ResolvedPiAiProviderProfile {
  const api: ProviderStreams = openAIResponsesApi()
  const models: Model<Api>[] = input.models.map(model => ({
    id: model.id,
    name: model.name ?? model.id,
    api: 'openai-responses',
    provider: input.provider,
    baseUrl: input.baseURL,
    // Reasoning models throughout; the effort level is requested per call.
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
    stream: (model, context, options) => api.stream(model, context, withCleanWire(options)),
    streamSimple: (model, context, options) => api.streamSimple(model, context, withCleanWire(options)),
  }
  return {
    provider: input.provider,
    displayName: input.displayName,
    api: 'openai-responses',
    baseURL: input.baseURL,
    apiKeyEnv: input.apiKeyEnv as CredentialRef,
    streamIdleTimeoutMs: DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    maxRequestImageBytes: DEFAULT_MAX_REQUEST_IMAGE_BYTES,
    requestImagePixelBudget: DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: DEFAULT_REQUEST_IMAGE_MAX_BYTES,
    retryPolicy: resolveRetryPolicy(undefined, `codex-account: provider "${input.provider}" retryPolicy`),
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
      'Codex 账号的路由通过账号服务的凭证（OAuth 令牌或 API Key）鉴权，不存储 pi-ai 凭据。',
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
