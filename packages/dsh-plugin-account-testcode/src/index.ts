/**
 * External TestCode account plugin (local-development form).
 *
 * One fake account product used to exercise the hub and provider seams end
 * to end: a 「可用国家与地区」 dropdown plus a dialog sign-in (account `123`,
 * password `abc` — anything else reports 登录失败, and a dropdown choice that
 * differs from the probed network exit is refused inside the modal, see
 * `regions.ts`), a `testcode-account` inference provider displayed as the
 * 'TestCode Acc' model group whose 「选择模型组」 dropdown (aav / vvi) selects
 * the advertised models (aav → a1/a2, vvi → b1/b2), and a static `TestOK`
 * reply for the aav-group `ac3` route. No browser code ships here; the hub
 * draws the card from the descriptor below and every interactive gesture
 * travels `invoke`.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-llm'
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions, LlmDiscoveredModel, LlmModelInfo, LlmProviderInfo, LlmReasoningEffortInfo,
  LlmResolvedModelInfo, ReasoningEffortId, StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type {} from '@dsh/api-account-hub'
import { ACCOUNT_HUB_CHANGED } from '@dsh/api-account-hub'
import type { AccountHubCardDescriptor, AccountHubCardState } from '@dsh/api-account-hub'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { z } from 'zod'
import zschema from '@deepseek-ai/schemastery'
import { REGIONS, detectExitRegion, regionLabel } from './regions.ts'
import type { ExitRegion } from './regions.ts'

/** Stable identity: hub account id, provider route, and credential scope. */
export const name = 'testcode-account-external'
const ID = name
const PROVIDER = 'testcode-account'

const KEY = credentialKey(ID, 'default')

/** The stored sign-in fact: which fake account is logged in. */
const grant = z.object({ version: z.literal(1), account: z.string().min(1) })

/** A volatile Config field arrives from schemastery as a frozen lazy box
 *  (`{ get }`), not the raw value — official plugins unwrap it with `.get()`
 *  so a settings write is visible without a fiber restart race. */
export interface VolatileBox<T> {
  readonly get: () => T
}

/** Plugin configuration type: which fake model group the provider advertises,
 *  and the model catalog adopted from the group's discovery. Both fields are
 *  `.volatile()`, so at runtime each arrives as a {@link VolatileBox}.
 *
 *  The group is stored under the `baseURL` key on purpose: the official
 *  「获取可用模型」 probe transmits the editor draft's `baseURL` verbatim in
 *  the discovery request, so binding the group select to that key lets the
 *  fetch answer the group the form currently shows — unsaved — exactly like
 *  the custom-API flow. After a save the committed value serves
 *  listModels/stream. */
export interface Config {
  baseURL?: VolatileBox<'aav' | 'vvi'>
  models?: VolatileBox<ModelRow[]>
  /** The persisted 可用国家与地区 choice (ISO-style region code). Committed
   *  through the account card's 保存 control into this settings namespace;
   *  read back on load to pre-fill the dropdown. */
  region?: VolatileBox<string>
}

/** One adopted catalog row, mirroring the official model-list editor's columns. */
export interface ModelRow {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  input?: string[]
}

const MODEL_MODALITIES = ['text', 'image'] as const

/** The row schema the official model-list editor writes; `id` is the only
 *  required field, every other column stays optional. */
const modelRow = zschema.object({
  id: zschema.string().required(),
  name: zschema.string(),
  contextWindow: zschema.number().step(1).min(1),
  maxTokens: zschema.number().step(1).min(1),
  input: zschema.array(zschema.union([...MODEL_MODALITIES])),
})

/** Plugin configuration schema; the hub's editor writes the group (under the
 *  `baseURL` draft key, see {@link Config}) and the adopted `models` catalog
 *  here on Save. A change restarts the plugin fiber, so the captured config is
 *  always current. The patch insert carries `config: {}` because a config-less
 *  activation would hand `undefined` to this schema and fail validation. Built
 *  with the harness schemastery `z` (NOT zod): every settings-visible field
 *  MUST be `.volatile()`, because the settings service projects only volatile
 *  fields into the namespace form — an all-plain Config projects to nothing
 *  and the namespace (with it the models-page row) simply disappears. */
export const Config = zschema.object({
  baseURL: zschema.union(['aav', 'vvi']).volatile(),
  models: zschema.array(modelRow).volatile(),
  // A free string (region codes are too many for a union); the geo gate
  // validates the choice against the detected exit at sign-in anyway.
  region: zschema.string().volatile(),
})

/** The brand mark: a small "TC" badge, inlined as a data URI. */
const LOGO_DATA_URI = 'data:image/svg+xml;base64,'
  + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">`
    + `<rect x="1" y="1" width="22" height="22" rx="6" fill="#3b6ef6"/>`
    + `<text x="12" y="16.5" font-family="Helvetica, Arial, sans-serif" font-size="11"`
    + ` font-weight="700" fill="#ffffff" text-anchor="middle">TC</text></svg>`, 'utf8').toString('base64')

/** The brand line both card states draw. */
const BRAND = Object.freeze({ logoUrl: LOGO_DATA_URI, name: 'TestCode账号' })

/** The declarative account card: the geo-gate region dropdown and the dialog
 *  sign-in on the account column, a note line and the model-group dropdown on
 *  the models-page provider card. The region select sits between the status
 *  head and the sign-in trigger; the gate itself lives in the sign-in invoke
 *  (the dialog submit merges the card's live values, dropdown included). */
const CARD: AccountHubCardDescriptor = {
  fields: [
    {
      key: 'region', kind: 'select', surface: 'account', when: 'signed-out',
      label: '可用国家与地区',
      // ~200 entries: the hub renders a filterable dropdown; the picked
      // region persists immediately, so reopening pre-selects it.
      searchable: true,
      autoSave: true,
      description: '登录前须选择，且须与当前网络出口地区一致，否则登录将被拒绝。选中即自动保存，下次打开默认选中。',
      options: REGIONS,
    },
    {
      key: 'signInDialog', kind: 'dialog', surface: 'account', when: 'signed-out',
      label: '登录', tone: 'primary', action: 'sign-in', busyLabel: '登录中…',
      dialog: {
        title: '登录 TestCode',
        fields: [
          { key: 'account', kind: 'text', label: '账号', placeholder: '请输入账号' },
          { key: 'password', kind: 'password', label: '密码', placeholder: '请输入密码' },
        ],
        submitLabel: '登录',
      },
    },
    { key: 'signOut', kind: 'button', surface: 'account', when: 'signed-in', action: 'sign-out', label: '退出登录', busyLabel: '退出中…' },
    { key: 'tagline', kind: 'note', surface: 'models', label: 'TestCode AccPOP' },
    {
      key: 'groupHint', kind: 'note', surface: 'models',
      label: '选择模型组后点击「获取可用模型」拉取该组模型；勾选加入目录并保存后即可使用。aav 组的 ac3 模型会回复 TestOK。',
    },
    {
      key: 'modelGroup', kind: 'select', surface: 'models', label: '选择模型组',
      // The choice lands in the editor draft's `baseURL` key: that is the one
      // draft key the official 「获取可用模型」 probe transmits, so the fetch
      // answers the group the form currently shows — no save needed first.
      bind: 'baseURL',
      // Drawn inside the model catalog block, under its top rule and above
      // the heading: the selector belongs with the list it feeds.
      placement: 'catalog',
      options: [
        { value: 'aav', label: 'aav' },
        { value: 'vvi', label: 'vvi' },
      ],
    },
  ],
}

/** The models each group advertises. */
const GROUP_MODELS: { [G in 'aav' | 'vvi']: readonly string[] } = {
  aav: ['a1', 'a2'],
  vvi: ['b1', 'b2'],
}

/** One model entry for the catalog. */
function modelInfo(provider: string, id: string, name?: string): LlmModelInfo {
  return { provider, id, name: name ?? id }
}

/**
 * The fake inference adapter. Every route resolves; the stream replies with
 * the static `TestOK` text only for the aav-group `ac3` model and refuses
 * every other combination, so the test stays meaningful.
 */
class TestCodeAdapter extends LlmAdapter {
  constructor(private readonly plugin: TestCodeAccountExternal) {
    super()
  }

  /** @inheritDoc */
  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'TestCode Acc' }
  }

  /** @inheritDoc */
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    // Same visibility semantics as the official account route: a signed-out
    // account advertises no models, so the models page (and any catalog
    // consumer) drops the provider until sign-in.
    if (!this.plugin.isSignedIn) return []
    // An adopted catalog wins once saved — even when the user emptied it
    // (a deliberate deletion must not resurrect the group's defaults);
    // before that the effective group's defaults serve.
    const stored = this.plugin.adoptedModels
    if (stored !== undefined) {
      return stored.map(model => modelInfo(provider, model.id, model.name))
    }
    return GROUP_MODELS[this.plugin.effectiveGroup].map(id => modelInfo(provider, id))
  }

  /** @inheritDoc */
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    // Adapter-owned 智力等级 choices: the harness selector renders whatever
    // efforts the resolved model advertises, named here.
    const efforts: readonly LlmReasoningEffortInfo[] = [
      { id: '1' as ReasoningEffortId, name: '1级' },
      { id: '2' as ReasoningEffortId, name: '2级' },
      { id: '3' as ReasoningEffortId, name: '3级' },
    ]
    return {
      provider, id: model, name: model, context: { contextWindow: 128_000 },
      reasoning: { efforts, defaultEffort: '1' as ReasoningEffortId },
    }
  }

  /** @inheritDoc */
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // The fake wallet charges per message, before any other check — a real
    // provider also rejects an unauthenticated or overdrawn account first.
    this.plugin.consumeCredit()
    if (this.plugin.effectiveGroup !== 'aav' || options.model !== 'ac3') {
      throw new LlmError('TestCode：仅「aav」组的「ac3」模型会回复 TestOK。', 'TESTCODE_NO_REPLY')
    }
    // The chosen 智力等级 rides the adapter-owned reasoningEffort; the reply
    // echoes the level so the selection is observable end to end.
    const effort = options.reasoningEffort ?? '1'
    const reply = `TestOK${effort}级`
    options.signal?.throwIfAborted()
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 0, outputTokens: 1, totalTokens: 1 } }
    options.signal?.throwIfAborted()
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/**
 * The account service. Hosting services (credentials, llm, accountHub) arrive
 * through injection; the plugin registers its provider and hub card in the
 * constructor and re-ingests the stored sign-in on init.
 */
export default class TestCodeAccountExternal extends Service {
  static inject = ['llm', 'credentials', 'accountHub']
  static Config = Config

  private readonly settingsNs: string
  private readonly config: Config
  private signedIn = false
  private account: string | null = null
  /** Fake wallet: a fresh sign-in grants $9; each chat deducts $1; 充值 restores it. */
  private balance = 0
  /** Exit-region probe outcome, driving the geo gate and the status line:
   *  'pending' while probing, 'ok' with the detected facts, 'failed' when
   *  every probe timed out or errored (the gate stays open — nothing to
   *  compare against). */
  private exitState: 'pending' | 'ok' | 'failed' = 'pending'
  private exit: ExitRegion | undefined
  /** Why the startup geo gate auto-signed-out, shown on the signed-out card. */
  private geoNotice: string | undefined
  private view: AccountHubCardState = { text: '未登录', level: 'warn', signedIn: false, brand: BRAND }

  /** @param ctx - host context. @param config - plugin configuration. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'testcodeAccount')
    this.settingsNs = ctx.fiber?.entry?.options.id ?? ID
    this.config = config

    ctx.on('credentials/record-updated', (key: string) => {
      if (key !== KEY) return
      void this.ingestStoredState()
    })

    this.registerProvider(ctx)
    this.registerHub(ctx)
    this.publish()
  }

  async [Service.init](): Promise<void> {
    await this.ingestStoredState()
    // The exit probe rides the plugin load, not the init gate: a slow or
    // dead probe service must not delay the plugin's readiness.
    void this.detectExit()
  }

  /** The currently selected fake model group: the committed `baseURL` key
   *  (the select writes its choice there — see {@link Config}). Unwraps the
   *  volatile box: reading the field directly would return the accessor, and
   *  indexing `GROUP_MODELS` with it yields `undefined` (the `.map` crash). */
  get modelGroup(): 'aav' | 'vvi' | undefined {
    return this.config.baseURL?.get()
  }

  /** Whether the settings user layer carries an explicit `models` write —
   *  an adoption, or a deliberate clearing. schemastery materializes the
   *  mounted volatile array as an empty box even when the user never wrote
   *  the field, so the config box alone cannot distinguish "never adopted"
   *  from "emptied"; the user layer can (a field's presence there marks a
   *  genuine user write). */
  private modelsAdopted(): boolean {
    try {
      const user = this.ctx.settings.describe().find(row => row.ns === this.settingsNs)?.user
      return typeof user === 'object' && user !== null && 'models' in user
    } catch {
      return false
    }
  }

  /** The adopted model catalog rows, if any were saved. Same box unwrapping.
   *  `undefined` also when the user never wrote the field — the mounted box
   *  would otherwise read as an adopted-empty catalog and starve the defaults. */
  get adoptedModels(): readonly ModelRow[] | undefined {
    if (!this.modelsAdopted()) return undefined
    return this.config.models?.get()
  }

  /** The group whose models serve when nothing is committed: the committed
   *  choice, else `aav`. The models page hides an account provider while its
   *  catalog is empty — and the group selector lives on that same card — so
   *  an empty catalog could never be filled through the UI (a dead-lock);
   *  the `aav` fallback keeps the row visible and the adoption flow
   *  reachable. */
  get effectiveGroup(): 'aav' | 'vvi' {
    return this.modelGroup ?? 'aav'
  }

  /** Whether an account is currently signed in; the adapter answers `listModels`
   *  with an empty catalog while false, so the models page hides the row. */
  get isSignedIn(): boolean {
    return this.signedIn
  }

  /** Deduct one chat's $1 from the fake wallet. Throws when signed out or
   *  out of credit, exactly where a real provider would refuse the request. */
  consumeCredit(): void {
    if (!this.signedIn) throw new LlmError('请先登录 TestCode 账号。', 'TESTCODE_SIGN_IN_REQUIRED')
    if (this.balance <= 0) throw new LlmError('余额已用完，请在账号页充值。', 'TESTCODE_NO_BALANCE')
    this.balance -= 1
    this.publish()
  }

  // ---- provider registration -------------------------------------------------

  private registerProvider(ctx: Context): void {
    ctx.llm.registerConfigurableProviders([
      { provider: PROVIDER, displayName: 'TestCode Acc', settingsNs: this.settingsNs, settingsPath: [], accountProvider: true },
    ])
    ctx.llm.registerAdapter([PROVIDER], new TestCodeAdapter(this))
    // The official 「获取可用模型」 probe: answers with the group the form
    // currently shows (the draft rides `request.baseURL`, see the discovery
    // body), so a fresh selection fetches without a save, exactly like the
    // custom-API flow.
    ctx.llm.registerModelDiscovery(this.settingsNs, async (request): Promise<readonly LlmDiscoveredModel[]> => {
      // The probe carries the draft's `baseURL` — with the group select bound
      // to that key, this is the group the form currently shows (saved or
      // not), matching the custom-API fetch parity. Fall back to the
      // committed choice when the draft shows nothing.
      const draftGroup = typeof request.baseURL === 'string' ? request.baseURL : undefined
      const group = draftGroup === 'aav' || draftGroup === 'vvi' ? draftGroup : this.modelGroup
      if (group === undefined) {
        throw new LlmError('请先选择模型组，再获取可用模型。', 'TESTCODE_NO_GROUP')
      }
      return GROUP_MODELS[group].map(id => ({ id, name: id }))
    })
  }

  // ---- hub registration ------------------------------------------------------

  private registerHub(ctx: Context): void {
    const dispose = ctx.accountHub.register({
      id: ID,
      displayName: 'TestCode 账号',
      settingsNs: this.settingsNs,
      provider: PROVIDER,
      modelsCard: true,
      // Direct production: the adapter fabricates the reply itself (no
      // upstream API) and hands the StreamChunk stream straight to harness.
      workMode: 'direct',
      card: CARD,
      invoke: (method: string, args: JsonValue) => this.invoke(method, args),
      getState: () => this.view as unknown as JsonValue,
    })
    ctx.effect(() => dispose, 'testcode-account-external: hub registration')
  }

  /** Forward one hub-card operation to its implementation. */
  private async invoke(method: string, args: JsonValue): Promise<JsonValue> {
    switch (method) {
      case 'sign-in': return this.signIn(args)
      case 'sign-out': {
        await this.signOut()
        return { message: '已退出登录。' }
      }
      case 'recharge': {
        if (!this.signedIn) return { message: '请先登录。', error: true }
        this.balance = 9
        this.publish()
        return { message: `充值成功，余额已恢复至 $${String(this.balance)}。` }
      }
      default: throw new Error(`未知账号操作 "${method}"`)
    }
  }

  // ---- published state -------------------------------------------------------

  /** Recompute and publish the account-card state. The signed-in layout
   *  carries the fake wallet: a balance row plus a 更多 row with the outward
   *  管网 link and the recharge action (an invoke, not a navigation). */
  private publish(): void {
    if (this.signedIn) {
      this.view = {
        text: this.account === null ? '已登录' : `已登录 · ${this.account}`,
        level: 'ok',
        signedIn: true,
        brand: BRAND,
        identity: { name: 'TestCode', contact: this.account === null ? undefined : `账号：${this.account}` },
        balance: {
          rows: [{ label: '余额', value: `$${String(this.balance)}` }],
          more: [{
            label: '更多',
            links: [
              { label: '管网', href: 'https://www.bing.com' },
              { label: '充值', action: 'recharge' },
            ],
          }],
        },
      }
    } else {
      const suffix = this.geoNotice !== undefined
        ? ` · ${this.geoNotice}`
        : this.exitState === 'pending'
          ? ' · 正在检测出口地区…'
          : this.exitState === 'ok' && this.exit !== undefined
            ? ` · 出口 ${this.exit.label}（${this.exit.ip}）`
            : ' · 出口检测失败'
      this.view = { text: `未登录${suffix}`, level: 'warn', signedIn: false, brand: BRAND }
    }
    this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)
  }

  // ---- credential plumbing ---------------------------------------------------

  /** Read the stored sign-in fact and republish. */
  private async ingestStoredState(): Promise<void> {
    const record = await this.ctx.credentials.readRecord(KEY)
    const parsed = record?.kind === 'grant' ? grant.safeParse(record.payload) : { success: false as const }
    if (!parsed.success) {
      this.signedIn = false
      this.account = null
      this.balance = 0
      this.publish()
      return
    }
    this.signedIn = true
    this.account = parsed.data.account
    // A stored sign-in re-grants the fresh-wallet amount (fake account: no
    // server-side wallet to re-read).
    this.balance = 9
    this.publish()
  }

  // ---- sign-in / sign-out ----------------------------------------------------

  /** Probe the exit region once and republish so the status line shows what
   *  the outside world sees (IP + country/region) — or that the probe failed.
   *  Doubles as the startup geo enforcement: while a sign-in is stored, the
   *  persisted region choice must still match the freshly probed exit. A
   *  mismatch (or a missing choice) reverts to the signed-out state — the
   *  credential record is deleted, so nothing can connect afterwards (the
   *  stream's credit gate refuses, `listModels` advertises nothing) until a
   *  region matching the exit is chosen and a fresh sign-in happens. */
  private async detectExit(): Promise<void> {
    const detected = await detectExitRegion()
    this.exit = detected
    this.exitState = detected === undefined ? 'failed' : 'ok'
    if (detected !== undefined && this.signedIn) {
      const persisted = this.config.region?.get() ?? ''
      if (persisted !== detected.code) {
        this.geoNotice = persisted === ''
          ? `已自动退出：请先选择「可用国家与地区」（当前出口 ${detected.label}）。`
          : `已自动退出：出口 ${detected.label} 与所选地区「${regionLabel(persisted)}」不一致。`
        await this.signOut()
        return
      }
    }
    this.publish()
  }

  /** Read one object-valued field out of an invoke payload. */
  private valuesOf(args: JsonValue): Record<string, JsonValue> {
    if (typeof args !== 'object' || args === null || Array.isArray(args)) return {}
    const values = (args as { values?: unknown }).values
    if (typeof values !== 'object' || values === null || Array.isArray(values)) return {}
    return values as Record<string, JsonValue>
  }

  private async signIn(args: JsonValue): Promise<JsonValue> {
    const values = this.valuesOf(args)
    const account = typeof values.account === 'string' ? values.account : ''
    const password = typeof values.password === 'string' ? values.password : ''
    // The geo gate: the dialog submit merges the card's live values, so the
    // dropdown's current choice rides `values.region` even when unsaved; a
    // dropdown left untouched falls back to the persisted choice. A detected
    // exit that differs from the effective choice refuses the sign-in inside
    // the modal (no `close`, so the message stays readable); a failed probe
    // leaves the gate open — there is nothing to compare against.
    const chosen = typeof values.region === 'string' ? values.region : ''
    const region = chosen !== '' ? chosen : (this.config.region?.get() ?? '')
    if (this.exitState === 'ok' && this.exit !== undefined && region !== this.exit.code) {
      const message = region === ''
        ? `请先在「可用国家与地区」中选择「${this.exit.label}」，再登录。`
        : `所选地区「${regionLabel(region)}」与当前出口地区「${this.exit.label}」不一致，无法登录。`
      return { message, error: true }
    }
    if (account === '123' && password === 'abc') {
      this.geoNotice = undefined
      await this.ctx.credentials.modifyRecord(KEY, current => Promise.resolve(
        current?.kind === 'grant' && grant.safeParse(current.payload).success
          ? undefined
          : { kind: 'grant' as const, payload: { version: 1, account } }))
      this.signedIn = true
      this.account = account
      this.balance = 9
      this.publish()
      return { message: '登录成功', close: true }
    }
    this.signedIn = false
    this.account = null
    this.publish()
    return { message: '登录失败', close: true, error: true }
  }

  private async signOut(): Promise<void> {
    // Session-scoped adoption: drop the managed `models` value so the models
    // page's visibility rule no longer pins the group after sign-out.
    await this.ctx.settings.mutate(this.settingsNs, [{ op: 'unset', path: ['models'] }])
    const record = await this.ctx.credentials.readRecord(KEY)
    if (record !== undefined) await this.ctx.credentials.deleteRecord(KEY)
    this.signedIn = false
    this.account = null
    this.balance = 0
    this.publish()
  }
}
