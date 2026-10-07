# API 接口开发文档（外部账号插件可调用的官方接口全集）

> 配套阅读《账号插件开发文档.md》（协议与总线设计）。本文件只讲**接口**：插件能调用什么、必须实现什么、参数与返回的确切形态。  
> 所有示例取自已通过端到端验证的两个实现：`dsh-plugin-deepseek-account/`（credential-inject）与 `dsh-plugin-account-testcode/`（direct）。

---

## 0. 依赖与导入清单

```ts
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'          // 让 patch 可装载本插件
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'                // ctx.credentials
import type {} from '@deepseek-ai/dsh-llm'                        // ctx.llm
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions, LlmDiscoveredModel, LlmModelInfo, LlmProviderInfo, LlmReasoningEffortInfo,
  LlmResolvedModelInfo, ReasoningEffortId, StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-api-account-hub'            // ctx.accountHub
import { ACCOUNT_HUB_CHANGED } from '@deepseek-ai/dsh-api-account-hub'
import type { AccountHubCardDescriptor, AccountHubCardState } from '@deepseek-ai/dsh-api-account-hub'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { z } from 'zod'                                           // 仅用于内部数据结构校验
import zschema from '@deepseek-ai/schemastery'                    // Config schema 必须用它（见 §5）
```

服务依赖声明：`static inject = ['llm', 'credentials', 'accountHub']`（可选服务一律懒取，见 §6）。

---

## 1. 账号枢纽注册面 `ctx.accountHub`（host 侧）

```ts
const dispose = ctx.accountHub.register(registration: AccountHubRegistration): () => void
ctx.accountHub.registration(id: string): AccountHubRegistration   // 取回已注册条目
ctx.accountHub.list(): AccountHubAccountView[]                    // 含 state 快照
```

### 1.1 `AccountHubRegistration`（插件必须提供）

| 成员            | 类型                                                | 必需 | 说明                                        |
| ------------- | ------------------------------------------------- | -- | ----------------------------------------- |
| `id`          | `string`                                          | ✓  | 稳定身份＝槽 key＋invoke 目标＋settings 配对          |
| `displayName` | `string`                                          | ✓  | 设置-账号栏行标题                                 |
| `settingsNs`  | `string`                                          | ✓  | 该账号 provider 参数写入的 settings namespace     |
| `workMode`    | `'credential-inject' \| 'direct'`                 | ✓  | 工作模式，非法值 register 直接抛错                    |
| `provider`    | `string`                                          |    | 该账号支撑的模型页 provider id；设置后 hub 才能服务模型页卡    |
| `modelsCard`  | `boolean`                                         |    | 是否在模型页 provider 卡渲染 `surface:'models'` 字段 |
| `card`        | `AccountHubCardDescriptor`                        |    | 账号卡描述符（`{ fields: [...] }`）               |
| `invoke`      | `(method, args: JsonValue) => Promise<JsonValue>` | ✓  | 浏览器动作转发入口，方法名插件私有                         |
| `getState`    | `() => JsonValue`                                 |    | 最新卡片状态，list/watch 时被调用                    |

注册返回的 dispose 建议登记为生命周期：`ctx.effect(() => dispose, '<id>: hub registration')`。

### 1.2 浏览器可达的 remote 面（由 harness 调用，插件只需知道会被转发）

```ts
list(): Promise<AccountHubAccountView[]>
invoke(accountId, method, args: JsonValue): Promise<JsonValue>
readParams(accountId): Promise<JsonValue>
commitParams(accountId, ops: SettingsPathOpView[]): Promise<void>
watch(signal?: AbortSignal): AsyncIterable<AccountHubChange>      // 变更信号，不含值
```

错误码（`RemoteError`）：`account-hub/unknown-account`、`account-hub/unavailable`、`account-hub/invoke-failed`、`account-hub/settings-unavailable`、`account-hub/commit-failed`。

---

## 2. 状态发布与事件

```ts
import { ACCOUNT_HUB_CHANGED } from '@deepseek-ai/dsh-api-account-hub'

private publish(): void {
  this.view = { /* AccountHubCardState，见 §3 */ }
  this.ctx.emit(ACCOUNT_HUB_CHANGED, ID)   // 推送变更信号
}
```

约定：**watch 流只是变更信号**，客户端收到后重调 `list()` 取值。`getState()` 每次都返回最新完整状态，不做增量。

### 2.1 `AccountHubCardState`（全部可选，未知键忽略）

```ts
{
  text?: string                          // 状态行文案
  level?: 'ok' | 'warn' | 'error'
  signedIn?: boolean                     // 驱动描述符字段的 when 显隐
  signingIn?: boolean                    // 登录进行中 → 隐藏按钮、显示进度
  brand?: { logoUrl?: string; name: string }        // 任意状态都必须带
  identity?: { name?, contact?, avatarUrl?, infoLabel?, infoUrl? }   // 非空→已登录布局
  balance?: {
    rows?: { label: string; value?: string; loading?: boolean;
             unavailable?: { label: string; href: string } }[]
    more?: { label: string;
             links: { label: string; href?: string; primary?: boolean; action?: string }[] }[]
  }
}
```

### 2.2 卡片描述符 `AccountHubCardDescriptor`

```ts
const CARD: AccountHubCardDescriptor = { fields: [
  { key: 'signInDialog', kind: 'dialog', surface: 'account', when: 'signed-out',
    label: '登录', tone: 'primary', action: 'sign-in', busyLabel: '登录中…',
    dialog: { title: '登录 X', submitLabel: '登录',
      fields: [{ key: 'account', kind: 'text', label: '账号', placeholder: '请输入账号' },
               { key: 'password', kind: 'password', label: '密码', placeholder: '请输入密码' }] } },
  { key: 'signOut', kind: 'button', surface: 'account', when: 'signed-in', action: 'sign-out',
    label: '退出登录', busyLabel: '退出中…' },
  { key: 'tagline', kind: 'note', surface: 'models', label: '说明文案' },
  { key: 'modelGroup', kind: 'select', surface: 'models', label: '选择模型组',
    bind: 'baseURL',                     // 绑编辑器草稿键，见 §4.3
    options: [{ value: 'aav', label: 'aav' }, { value: 'vvi', label: 'vvi' }],
    description: '选组后点「获取可用模型」…' },
] }
```

字段类型 `kind`：`text | password | checkbox | select | button | dialog | note`；`surface`：`account | models`（省略=两处都渲染）；`when`：`signed-in | signed-out`。  
`select.bind`、`button.action`、`dialog.*` 语义见 §4.3 与《账号插件开发文档》§六。

---

## 3. 凭据面 `ctx.credentials`

```ts
import { credentialKey } from '@deepseek-ai/dsh-credentials'
const KEY = credentialKey(<pluginId>, 'default')      // 令牌凭据
const DEVICE = credentialKey(<pluginId>, 'device')    // 设备/资料凭据（可多份）

await ctx.credentials.readRecord(KEY)                 // 读取（无则 undefined）
await ctx.credentials.writeRecord(KEY, value)         // 写入/更新
await ctx.credentials.deleteRecord(KEY)               // 删除（登出用）

ctx.on('credentials/record-updated', (key: string) => {   // 启动回种：重启不丢登录态
  if (key !== KEY) return
  void this.ingestStoredState()
})
```

凭据内容建议用 zod schema 定义并 `safeParse` 回验证（防旧版本残留）。**hub 永不见密钥**——凭据只在本插件进程内解析。

---

## 4. LLM 面 `ctx.llm`

### 4.1 三个注册方法

```ts
ctx.llm.registerConfigurableProviders([{
  provider: PROVIDER,                    // 模型页 provider id
  displayName: 'X Acc',
  settingsNs: this.settingsNs,
  settingsPath: [],
  accountProvider: true,                 // ★ 声明「可用性跟随登录态」
}])

ctx.llm.registerAdapter([PROVIDER], new BrandAdapter(this))

ctx.llm.registerModelDiscovery(
  this.settingsNs,
  async (request): Promise<readonly LlmDiscoveredModel[]> => { /* 见 4.3 */ },
)
```

`accountProvider: true` 是**行可见性通用规则**的开关：声明后 harness 以「会话模型目录中该 provider 组是否非空」判定模型页行是否渲染；插件只需保证**登出时 `listModels` 返回 `[]`**，无需清任何配置（重登自动恢复）。

### 4.2 adapter 实现面（`extends LlmAdapter`）

```ts
class BrandAdapter extends LlmAdapter {
  override providerInfo(provider: string): LlmProviderInfo
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]>          // { provider, id, name }
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}
```

`stream` 的 chunk 序列（harness 归一化/计量/持久化的输入，插件不得省略）：

```ts
yield { type: 'block-start', index: 0, blockType: 'text' }
yield { type: 'text-delta', index: 0, text: reply }
yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
yield { type: 'usage', usage: { inputTokens: N, outputTokens: M, totalTokens: N + M } }
yield { type: 'finish', reason: { kind: 'stop' } }
```

失败一律 `throw new LlmError(message, 'BRAND_CODE')`；取消用 `options.signal?.throwIfAborted()` 在合适断点检查。

**登出/鉴权/计费等前置检查放在 `stream` 最前面**（真实 provider 也是先拒绝再处理）。

### 4.3 模型发现与「获取可用模型」

```ts
ctx.llm.registerModelDiscovery(this.settingsNs, async (request) => {
  // 官方探针只透传草稿的三个键：baseURL / api / apiKey
  const draft = typeof request.baseURL === 'string' ? request.baseURL : undefined
  const group = isValid(draft) ? draft : this.modelGroup      // 草稿优先 → 已保存回退
  if (group === undefined) throw new LlmError('请先选择模型组，再获取可用模型。', 'BRAND_NO_GROUP')
  return GROUP_MODELS[group].map(id => ({ id, name: id }))    // LlmDiscoveredModel[]
})
```

- 返回值经官方 ModelListEditor 呈现为勾选窗；用户采纳后写入 Config 的 `models` 目录（行结构 `{id, name?, contextWindow?, maxTokens?, input?}`，`id` 必填）。
- **插件侧的 `models` 采用「目录优先」原则**：`listModels` 先返回已采纳目录，未采纳时用组默认兜底。
- 若把 param select 的 `bind` 设成 `baseURL`（如上 TestCode 的模型组），则**未保存的表单值也能参与发现**，与自定义 API 的「按表单当前所示发问」完全同流。

### 4.4 ★ 推理/智力等级接口（adapter 侧参数）

档位的**列表、名称、默认值**全部由 adapter 下发，harness 只负责渲染与回传：

```ts
override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
  const efforts: readonly LlmReasoningEffortInfo[] = [
    { id: '1' as ReasoningEffortId, name: '1级' },   // id = 回传值；name = 显示文案
    { id: '2' as ReasoningEffortId, name: '2级' },
    { id: '3' as ReasoningEffortId, name: '3级' },
  ]
  return {
    provider, id: model, name: model,
    context: { contextWindow: 128_000 },
    reasoning: { efforts, defaultEffort: '1' as ReasoningEffortId },
  }
}

override async *stream(options: GenerateOptions) {
  const effort = options.reasoningEffort ?? '1'      // 未选时按默认档
  const reply = `TestOK${effort}级`
  // …yield chunks
}
```

要点：

| 项                                                                           | 归谁                                                                                                                                |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 档位列表 `reasoning.efforts`、显示名 `name`、默认档 `defaultEffort`                     | **adapter/插件**（`resolveModel` 下发，随 modelCatalog 到主页）                                                                              |
| 选择器的渲染位置、所选档位的持久化                                                           | **harness**                                                                                                                       |
| 所选值回传 `GenerateOptions.reasoningEffort`（`ReasoningEffortId`=branded string） | harness → adapter                                                                                                                 |
| 分组标题「推理等级」文案                                                                | **harness 全局 locale**（`ui-model-selection` 的 `menu.effort`），**插件侧不可覆盖**；改它只能全局改 locale，或做 hub 设计级修正（给 `LlmReasoningSpec` 加可选标题字段） |


`ReasoningEffortId` 的品牌构造函数未导出给插件，构造字面量用 `'1' as ReasoningEffortId` 断言。  
credential-inject 模式若复用官方 adapter（如 DeepSeek），档位表由官方 adapter 的 `model-info.ts` 决定，插件无需重复声明。

---

## 5. 配置面：Config schema 与 settings 写入

**schema 必须用 schemastery（非 zod），且可见字段必须 `.volatile()`**——settings 只把 volatile 字段投影进 namespace；全 plain 的 Config 投影为空 → namespace 消失 → 模型页行不渲染。

```ts
export const Config = zschema.object({
  baseURL: zschema.union(['aav', 'vvi']).volatile(),
  models: zschema.array(modelRow).volatile(),      // schemastery 无 .optional()，默认即可选
})
```

**volatile 字段运行时是惰性盒 `{get}`，必须 `.get()` 解包**（直接读拿到的是访问器对象，索引/比较全失真）：

```ts
export interface VolatileBox<T> { readonly get: () => T }
interface Config { baseURL?: VolatileBox<'aav' | 'vvi'>; models?: VolatileBox<ModelRow[]> }

get modelGroup() { return this.config.baseURL?.get() }
get adoptedModels() { return this.config.models?.get() }
```

插件主动写 settings（如把采纳结果落到 `models`）：

```ts
interface SettingsFace { mutate(ns: string, ops: unknown[]): Promise<unknown> }
const settings = ctx.get('settings') as SettingsFace
await settings.mutate(this.settingsNs, [{ op: 'set', path: ['models'], value: models }])
```

---

## 6. 可选服务的懒取约定

不要 `static inject` 硬依赖可选服务（会导致插件停用后 entry 永久 pending）：

```ts
import type { DeepSeekAccount } from '@deepseek-ai/dsh-deepseek-account'
const account = this.ctx.get('deepseekAccount') as DeepSeekAccount | undefined
const identity = await account?.getDeviceIdentity().catch(() => undefined)
```

（这正是 harness 侧 `product-analytics` 已采用的模式；插件侧同理。）

---

## 7. 最小插件骨架（可复制改写）

```ts
export default class BrandAccountPlugin extends Service {
  static inject = ['llm', 'credentials', 'accountHub']
  static Config = Config

  constructor(ctx: Context, config: Config) {
    super(ctx, 'brandAccount')
    this.settingsNs = ctx.fiber?.entry?.options.id ?? ID
    ctx.on('credentials/record-updated', key => { if (key === KEY) void this.ingestStoredState() })
    this.registerProvider(ctx)
    this.registerHub(ctx)
    this.publish()
  }

  async [Service.init](): Promise<void> { await this.ingestStoredState() }

  private async invoke(method: string, args: JsonValue): Promise<JsonValue> {
    switch (method) {
      case 'sign-in':  return this.signIn(args)          // 返回 { message, close? , error? }
      case 'sign-out': await this.signOut(); return { message: '已退出登录。' }
      case 'recharge': /* … */ return { message: '充值成功。' }
      default: throw new Error(`未知账号操作 "${method}"`)
    }
  }
}
```

返回值约定：`invoke` 返回 `{ message: string, error?: boolean, close?: boolean }`——`message` 渲染到卡片/弹窗，`error` 用错误色，`close: true` 在 dialog 里稍后自动关闭。

---

## 8. 接口速查表

| 需要做的事           | 接口                                                                                     |
| --------------- | -------------------------------------------------------------------------------------- |
| 让账号出现在设置-账号栏    | `ctx.accountHub.register({..., card, getState})`                                       |
| 画四态/余额/更多栏按钮    | `AccountHubCardState`（brand/identity/balance/more.action）                              |
| 卡片刷新显示          | `ctx.emit(ACCOUNT_HUB_CHANGED, id)`                                                    |
| 登录态持久化          | `ctx.credentials.{readRecord,writeRecord,deleteRecord}` + `credentials/record-updated` |
| 模型页出现行并可配置      | `registerConfigurableProviders({ accountProvider: true })` + Config volatile 字段        |
| 模型页卡显示自定义字段     | CARD 的 `surface:'models'` 字段 + `modelsCard: true` + `provider`                         |
| 「获取可用模型」        | `registerModelDiscovery(ns, discovery)` + select `bind` 到 baseURL/api/apiKey           |
| 推理/智力档位         | `resolveModel` 返 `reasoning.{efforts,defaultEffort}`；`options.reasoningEffort` 读回      |
| 回复 LLM 流        | adapter `stream` yield StreamChunk 序列（失败用 `LlmError`）                                  |
| 登出后模型页卡消失       | adapter `listModels` 未登录返回 `[]`（配合 `accountProvider: true`）                            |
| 主动写配置（无需 UI 保存） | `ctx.get('settings').mutate(ns, [{op:'set', path, value}])`                            |
