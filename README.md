# DSH Plugin Collection / DeepSeek Harness 外部插件集

DeepSeek Harness 的全部外部插件，独立于 harness 主仓库之外，pnpm workspace 自包含。

External plugins for the DeepSeek Harness, kept standalone from the harness repo. Self-contained pnpm workspace.

## 插件清单 / Plugins

全部位于 `packages/` 下 / All under `packages/`:

| 目录 | 说明 | 依赖 account-hub |
|---|---|---|
| `dsh-plugin-account-hub` | 账号管理枢纽（官方宿主适配：hub API / 桌面 shim / UI 组件 ×2） | ——（本体） |
| `dsh-plugin-account-testcode` | TestCode 测试账号插件（direct 模式） | ✅ 必须 |
| `dsh-plugin-llama-local` | 本地 GGUF 推理插件：xLAM-2-3B-fc-r（函数调用）/ Qwen3-0.6B 兜底，node-llama-cpp 引擎，工具调用走别名注入 + 解析回环 | ✅ 必须 |
| `dsh-plugin-zcode-ability` | ZCode 移植容器：persona / skills / plan / workflow / environment（zCode之剑 预设）+ z.ai-account 账号 + 8 个技能 | ⚠️ 仅 z.ai-account |
| `dsh-plugin-qwen-ability` | Qwen 容器：账号 / persona / loop / environment（Qwen的折扇 预设） | ⚠️ 仅 qwen-account |
| `dsh-plugin-codex-ability` | Codex 容器：账号 / persona / loop / environment（Codex吐息 预设） | ⚠️ 仅 codex-account |
| `dsh-plugin-claude-ability` | Claude 容器：账号 / persona / loop / environment（Claude心流 预设） | ⚠️ 仅 claude-account |
| `dsh-plugin-digital-hands` | 数据手：声明式工具方案（受管 MCP 服务器 + 本地脚本工具）与 tool_search 目录，设置页含工具总账 / MCP 管理 / 方案编辑器 | ——（本体） |

## 版本适配 / Harness compatibility

- **当前适配 DeepSeek Harness `0.2.1-rc.1`（同时兼容 `0.2.0-rc.2`）** / Currently targets DeepSeek Harness `0.2.1-rc.1` (still compatible with `0.2.0-rc.2`).
- 自 dsh 0.2.1 起，启动链路对 profile patch 层的插件行做兼容性预检：manifest 未声明
  `engines.dsh` 时，所有 `@deepseek-ai/dsh-*` peerDependencies 必须满足运行时版本，
  否则对应插件行会被强制禁用（stderr 打印 `disabling profile plugin`）。本仓库全部
  17 个含 dsh peer 的组件包均已声明 `engines.dsh`，并将 peer 枚举到 `0.2.1-rc.1`。
- Since dsh 0.2.1, the boot pipeline runs a compatibility preflight over
  profile-patch-layer plugin rows: without `engines.dsh`, every
  `@deepseek-ai/dsh-*` peerDependency must match the running runtime or the row
  is force-disabled (`disabling profile plugin` on stderr). All 17 component
  packages with dsh peers now declare `engines.dsh` and enumerate `0.2.1-rc.1`.
- 每次升级 harness 后，请将本仓库对应包的 `engines.dsh` / peer 范围枚举新版本并重装
  profile 链接 / After each harness upgrade, enumerate the new version in
  `engines.dsh` / peer ranges and re-sync the profile links.

## 依赖关系 / Dependencies

**account-hub 是所有账号插件的宿主。** deepseek-account、qwen-account、codex-account、
z.ai-account、account-testcode、llama-local 的账号卡片全部通过 hub API 注册进
account-hub 的「设置-账号」界面——不装 hub，这些插件没有 UI 入口，账号无法登录与
管理。容器内的 persona / loop / environment / skills 等纯提示词与预设组件不依赖 hub。

**account-hub is required by every account plugin.** The account cards of
deepseek-account, qwen-account, codex-account, z.ai-account, account-testcode and
llama-local all register through the hub API into account-hub's Settings-Account
page. Without hub installed they have no UI surface and accounts cannot be signed
in or managed. Persona / loop / environment / skills components inside the
containers do not depend on hub.

因此安装任何账号插件前，先安装 account-hub / Install account-hub first, then the
account plugins.

### account-hub 与官方 DeepSeek 账号

当前版本使用 **官方 DeepSeek 账号宿主**（`dsh-deepseek-account-platform` +
`account-controller`），account-hub 只接管账号页与模型页 UI：

- 账号页由 hub 绘制，DeepSeek 卡片通过官方 `remote.account` 读取/登录/退出
- 模型页由 hub 承载（rc3 页面），DeepSeek 账号模型卡使用官方 provider 数据
- 未登录账号、未加载的本地模型不会显示模型卡片
- 官方「DeepSeek API（API Key）」模型组仍被禁用

DeepSeek 复刻插件 `dsh-plugin-deepseek-account` 已删除，不再需要安装。

## ⚠️ 账号风险警告 / Account risk warning

**适用于需要登录的账号插件：`deepseek-account`、`codex-account`（订阅 OAuth）、
`z.ai-account`（OAuth）、`qwen-account`（API Key）、`claude-account`（订阅 OAuth / Console Key）。**

这些插件为官方客户端行为的**开源代码移植**：登录与请求流程已考虑指纹伪造（客户端
平台标识、User-Agent、设备标识等请求头），但**未经过长期压力测试**，无法保证不被
官方风控识别——**存在账号被限制或封禁的风险，请酌情使用**。建议不要绑定重要账号，
因使用本插件产生的账号后果由使用者自行承担。

其中 **`claude-account` 的订阅 OAuth 通道风险更高**：Anthropic 未官方开放第三方
客户端接入，该通道属灰色地带且风控严格；其 **Console API Key 模式完全合法**，
推荐优先使用。

**Applies to the login-capable account plugins: `deepseek-account`,
`codex-account` (subscription OAuth), `z.ai-account` (OAuth) and
`qwen-account` (API key).**

These plugins are **open-source ports of official client behaviour**. Fingerprint
spoofing (client platform, User-Agent, device headers) is taken into account, but
they have **not been stress-tested over the long term** — the vendor's risk
control may still detect them. **There is a real risk of account restriction or
ban; use at your own discretion**, preferably not with accounts you cannot afford
to lose. Any consequences to your account are your own responsibility.

## 仓库不含的内容 / Not included

- `node_modules/` —— 根目录 `pnpm install` 自包含重建（宿主依赖走 npm，pi-ai 0.87.1 经 patchedDependencies 修补；llama-local 的全平台预编译二进制由 `supportedArchitectures` 约定，macOS 与 Windows 共用同一份）。
- `dist/` —— 构建产物，各包内重建：`tsc -p tsconfig.build.json`。
- `models/` —— 模型权重（单文件远超 Git 托管上限）。llama-local 权重用 `node scripts/fetch-model.mjs` 重新拉取。
- `.state/` —— 运行时状态（如 llama-local 的启用标记）。

## 构建与安装 / Build & install

1. 安装：仓库根 `pnpm install`（pnpm 11.x）。
2. 构建：各包 `tsc -p tsconfig.build.json`。
3. 装机：官方 App profile（`~/.dsh/profiles/desktop`）以 `link:` 指向各容器包，`pnpm install` 同步；依赖键与 bundle 清单中，账号插件须与 account-hub 同时出现。

## 许可 / License

[MIT](./LICENSE)
