/**
 * Models settings page store: one snapshot joining the configurable-provider
 * directory (`llm/listProviders` joined with `llm/listConfigurableProviders`),
 * the settings namespaces (shared settings mirror),
 * and the referenced credentials (`credentials/describe`). The host stays the
 * single fact source — every mutation writes through the wire and the page
 * re-renders from the next describe, pushed or refetched.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {
  CredentialInfo, LlmConfigurableProvider, LlmProviderInfo, SettingsNamespaceView,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SettingsSchemaOperations } from './schema-operations.ts'

/**
 * Any route key walks a dict schema to the same profile node, so the lookup
 * names one that cannot collide with a configured route.
 */
const PROBE_ROUTE = '\u0000probe'

/** One provider row after joining the configurable directory with live routes. */
export interface ProviderDirectoryEntry {
  readonly provider: string
  readonly displayName: string
  readonly settingsNs: string
  readonly settingsPath: readonly string[]
  readonly active: boolean
  readonly declared?: boolean
  readonly error?: string
}

/** The account route the page pins to the top when it is declared. */
const PINNED_ACCOUNT_ROUTE = 'deepseek-account'

/** Row rank: pinned account first, other account-backed routes next,
 *  ordinary routes last. Ties keep declaration order (stable sort). */
function rowRank(entry: ProviderDirectoryEntry): number {
  if (entry.provider === PINNED_ACCOUNT_ROUTE) return 0
  return entry.provider === 'deepseek-account' ? 0 : entry.provider === 'deepseek-official' ? 1 : 2
}

/**
 * Join declared configurable providers with the currently registered routes.
 * @param registered - live provider routes in registration order.
 * @param directory - declared configurable providers in declaration order.
 * @returns rows sorted by the shared rank rule: the DeepSeek account first,
 *   other account-backed routes next, ordinary routes last.
 */
export function joinProviderDirectory(
  registered: readonly LlmProviderInfo[],
  directory: readonly LlmConfigurableProvider[],
): ProviderDirectoryEntry[] {
  const active = new Set(registered.map(provider => provider.id))
  const declared = new Set(directory.map(entry => entry.provider))
  const rows: ProviderDirectoryEntry[] = directory.map(entry => ({
    provider: entry.provider,
    displayName: entry.displayName,
    settingsNs: entry.settingsNs,
    settingsPath: [...entry.settingsPath],
    active: active.has(entry.provider),
    ...entry.declared === undefined ? {} : { declared: entry.declared },
    ...entry.error === undefined ? {} : { error: entry.error },
  }))
  for (const provider of registered) {
    if (declared.has(provider.id)) continue
    rows.push({
      provider: provider.id,
      displayName: provider.name,
      settingsNs: '',
      settingsPath: [],
      active: true,
    })
  }
  return rows.toSorted((left, right) => rowRank(left) - rowRank(right))
}

/** One provider row the page renders. */
export interface ProviderRow {
  /** Account route has usable credentials for the configured inference origin. */
  accountAvailable?: boolean
  /** The models the session catalog currently advertises for this route, if
   *  any. The account editor falls back to these as its inherited rows: a
   *  signed-in account that never adopted still broadcasts its built-in
   *  defaults to the home selector, and the card must show the same rows or
   *  the two surfaces disagree (an empty card under a visible selector API). */
  liveModels?: readonly { id: string; name?: string }[]
  /** The directory entry (route id, display name, settings address, live state). */
  entry: ProviderDirectoryEntry
  /** Whether any layer configures this provider (its profile resolves). */
  configured: boolean
  /** Whether the user layer alone carries the profile (removal restores the base). */
  removable: boolean
  /** The credential reference the resolved profile names, when one does. */
  apiKeyEnv: string | undefined
  /** Credential state for {@link apiKeyEnv}, once described. */
  credential: CredentialInfo | undefined
  /**
   * Credential state for the page's derived `<ROUTE>_API_KEY`, described only
   * while the profile names no reference — the provider-card seat's
   * `keyConfigured` fact for dormant and keyless rows, matching the editor's
   * own derivation rule.
   */
  derivedCredential?: CredentialInfo
}

/** Page snapshot. */
export interface ModelsSettingsState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Whole-load failure text; row-level write failures stay in the editor. */
  error: string | null
  /** Credential enrichment failure; provider/settings rows remain usable. */
  credentialError: string | null
  /** Whether the settings provider accepts writes. */
  writable: boolean
  /** Every configurable provider joined with its configured/credential state. */
  rows: readonly ProviderRow[]
  /** Namespace views by ns, for the editor's schema/layers/secrets. */
  namespaces: ReadonlyMap<string, SettingsNamespaceView>
}

/**
 * Derive the conventional credential reference for a provider route: the v1
 * page never asks for an environment-variable name, so a typed key stores
 * under this derived reference and the profile records it as `apiKeyEnv`.
 * @param provider - provider route id (e.g. `anthropic`, `minimax-cn`).
 * @returns the derived reference name (e.g. `MINIMAX_CN_API_KEY`).
 */
export function deriveKeyRef(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

/**
 * The wire protocols a hand-declared route may name, read out of the owning
 * namespace's own schema. This stays a schema read rather than a wire field so
 * the choices the page offers cannot drift from the ones the adapter accepts:
 * both come from the same `Config`.
 * @param namespace - the namespace view whose schema declares the profile shape.
 * @param schema - settings schema operations.
 * @returns the protocol identifiers, or an empty list when the schema has none.
 */
export function protocolChoices(
  namespace: SettingsNamespaceView | undefined,
  schema: SettingsSchemaOperations,
): string[] {
  if (namespace === undefined) return []
  const node = schema.nodeAtPath(schema.rehydrate(namespace.schema), ['providers', PROBE_ROUTE, 'api'])
  const list = (node as { type?: string; list?: readonly { value?: unknown }[] } | undefined)
  if (list?.type !== 'union' || list.list === undefined) return []
  return list.list.map(entry => entry.value).filter((value): value is string => typeof value === 'string')
}

/** The credential reference a resolved profile names (its `apiKeyEnv` field). */
function apiKeyEnvOf(
  namespace: SettingsNamespaceView | undefined,
  path: readonly string[],
  schema: SettingsSchemaOperations,
): string | undefined {
  if (namespace === undefined) return undefined
  const profile = schema.getPath(namespace.value, path)
  if (typeof profile !== 'object' || profile === null) return undefined
  const ref = (profile as { apiKeyEnv?: unknown }).apiKeyEnv
  return typeof ref === 'string' && ref.length > 0 ? ref : undefined
}

/** The models settings page controller (one per settings surface). */
export class ModelsSettingsStore {
  /** The snapshot the section renders from (uSES-safe store). */
  readonly store: SnapshotStore<ModelsSettingsState> = createSnapshotStore<ModelsSettingsState>({
    status: 'idle', error: null, credentialError: null, writable: false, rows: [], namespaces: new Map(),
  })

  /** Latest load wins; an older response never overwrites a newer one. */
  private generation = 0

  /**
   * @param ctx - the page plugin's context, whose `remote.llm` and
   * `remote.credentials` namespaces carry the directory and credential reads.
   * @param schema - settings-owned schema and immutable path operations.
   * @param describeFace - the shared mirror's describe face (namespace views and writability).
   */
  constructor(
    private readonly ctx: ClientContext,
    private readonly schema: SettingsSchemaOperations,
    private readonly describeFace: SettingsDescribeFace,
  ) {}

  /**
   * Refresh the whole page snapshot: the provider directory and the mirror's
   * settings answer in parallel, then one batched credential describe over
   * every referenced ref. Provider failure or absence of an initial settings
   * answer keeps the last good rows and surfaces an error; a failed settings
   * refresh reuses the mirror's held view.
   * @returns nothing; the snapshot carries the outcome.
   */
  async load(): Promise<void> {
    const generation = ++this.generation
    this.store.update((s) => { s.status = 'loading'; s.error = null })
    const [registered, declared] = await Promise.all([
      this.ctx.remote.llm.listProviders(),
      this.ctx.remote.llm.listConfigurableProviders(),
      this.describeFace.ensure(),
    ])
    if (!registered.ok) { this.failLoad(generation, registered.error.message); return }
    if (!declared.ok) { this.failLoad(generation, declared.error.message); return }
    const mirrored = this.describeFace.getSnapshot()
    if (mirrored.view === undefined) {
      this.failLoad(generation, mirrored.error ?? 'settings are unavailable in this browser')
      return
    }
    const providers = joinProviderDirectory(registered.value, declared.value)
    const writable = mirrored.view.writable
    const views: readonly SettingsNamespaceView[] = mirrored.view.namespaces
    const namespaces = new Map(views.map(view => [view.ns, view]))
    const rows: ProviderRow[] = providers.map((entry) => {
      const namespace = namespaces.get(entry.settingsNs)
      const configured = namespace !== undefined
        && (entry.settingsPath.length === 0 || this.schema.getPath(namespace.value, entry.settingsPath) !== undefined)
      const removable = namespace !== undefined
        && entry.settingsPath.length > 0
        && this.schema.hasPath(namespace.user, entry.settingsPath)
        && !this.schema.hasPath(namespace.base, entry.settingsPath)
      return {
        entry,
        configured,
        removable,
        apiKeyEnv: entry.provider === 'deepseek-account' ? undefined : apiKeyEnvOf(namespace, entry.settingsPath, this.schema),
        credential: undefined,
      }
    })
    // 真实登录态：官方账号 getState + hub 账号 state.signedIn。
    // 未登录的账号 provider 不显示模型卡片；本地模型插件用 signedIn 表示“已加载”，
    // 行本身只在加载后发布，因此不会被误隐藏。
    let officialSignedIn = false
    const hubSignedIn = new Map<string, boolean>()
    try {
      const remote = this.ctx.remote as unknown as {
        account?: { getState(): Promise<{ ok: boolean, value?: { status?: string } }> }
        accountHub?: { list(): Promise<{ ok: boolean, value?: Array<{ settingsNs?: string, state?: { signedIn?: boolean } }> }> }
      }
      const official = await remote.account?.getState()
      officialSignedIn = official?.ok === true && official.value?.status === 'credential-stored'
      const hubs = await remote.accountHub?.list()
      if (hubs?.ok === true) {
        for (const view of hubs.value ?? []) {
          if (typeof view.settingsNs === 'string' && typeof view.state?.signedIn === 'boolean') {
            hubSignedIn.set(view.settingsNs, view.state.signedIn)
          }
        }
      }
    } catch { /* 读取失败时按未登录处理 */ }
    // Account-backed routes ride a sign-in, not a stored key: their row is
    // visible while the live catalog still advertises their models, OR while
    // the namespace carries an explicit `models` value the user has managed —
    // an emptied catalog (`[]`) must keep its card (the host strips empty
    // groups from the session catalog, so catalog presence alone would hide
    // a group the user deliberately cleared). A signed-out account whose
    // catalog was never touched lists neither, so it stays hidden.
    if (rows.some(row => /^deepseek/i.test(row.entry.provider))) {
      const catalog = await this.ctx.remote.session.modelCatalog()
      for (const row of rows) {
        if (!/^deepseek/i.test(row.entry.provider)) continue
        const liveGroup = catalog.ok
          ? catalog.value.groups.find((group: { id: string, models: unknown[] }) =>
              group.id === row.entry.provider || group.id === 'deepseek-account')
          : undefined
        const live = liveGroup !== undefined && liveGroup.models.length > 0
        if (live) {
          row.accountAvailable = true
          // The live rows ride along for the editor's inherited fallback:
          // only id/name survive the host catalog projection, so inherited
          // rows lose per-model caps until the user adopts or edits them.
          row.liveModels = liveGroup.models.map((model: { id: string, name?: string }) => ({
            id: model.id,
            ...(typeof model.name === 'string' && model.name.length > 0 ? { name: model.name } : {}),
          }))
          continue
        }
        // 未登录时 catalog 不提供该账号的模型组：卡片不应继续显示。
        // 不再用本地 `models` 配置兜底，否则退出登录后卡片仍会残留。
        row.accountAvailable = false
      }
    }
    const credentialRows = rows.filter(row => row.entry.provider !== 'deepseek-account')
    const refs = [...new Set(credentialRows.map(row => row.apiKeyEnv ?? deriveKeyRef(row.entry.provider)))]
    let credentials: Record<string, CredentialInfo> = {}
    let credentialError: string | null = null
    if (refs.length > 0) {
      const response = await this.ctx.remote.credentials.describe(refs)
      // Credential state is an enrichment for the Models page: a failure
      // degrades the badge instead of failing the load. The onboarding
      // projection below retains the failure distinction.
      if (response.ok) credentials = response.value
      else credentialError = response.error.message
    }
    if (generation !== this.generation) return
    this.store.update((s) => {
      s.status = 'ready'
      s.error = null
      s.credentialError = credentialError
      s.writable = writable
      s.rows = rows
        .filter(row => !/^deepseek/i.test(row.entry.provider) || (officialSignedIn && row.accountAvailable === true))
        .filter(row => hubSignedIn.get(row.entry.settingsNs) !== false)
        .map((row) => {
        if (row.entry.provider === 'deepseek-account') return row
        const named = row.apiKeyEnv === undefined ? undefined : credentials[row.apiKeyEnv]
        const derived = row.apiKeyEnv !== undefined ? undefined : credentials[deriveKeyRef(row.entry.provider)]
        return {
          ...row,
          ...named === undefined ? {} : { credential: named },
          ...derived === undefined ? {} : { derivedCredential: derived },
        }
      })
      s.namespaces = namespaces
    })
  }

  /** Publish one load's failure text, unless a newer load already took over. */
  private failLoad(generation: number, message: string): void {
    if (generation !== this.generation) return
    this.store.update((s) => {
      s.status = 'error'
      s.error = message
    })
  }
}

/**
 * Whether a joined row can serve model requests as it stands: the route is
 * registered with the adapter registry, and whatever credential its resolved
 * profile names is stored. A profile naming no reference authenticates through
 * the provider's own path (the Bedrock chain, Vertex ADC, a gateway that needs
 * nothing), as does a live route with no settings address at all, so neither
 * owes this page a key.
 * @param row - one joined provider row.
 * @returns whether the user already has this provider to talk to.
 */
export function providerUsable(row: ProviderRow): boolean {
  if (!row.entry.active) return false
  // An account-backed route authenticates through its sign-in, not a stored
  // key: usable exactly while its catalog group is live.
  if (row.entry.provider === 'deepseek-account') return row.accountAvailable === true
  if (row.apiKeyEnv === undefined) return true
  return row.credential?.configured === true
}
