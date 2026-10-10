# DSH Plugin Collection / DeepSeek Harness 外部插件集

DeepSeek Harness 的全部外部插件，独立于 harness 主仓库之外，pnpm workspace 自包含。

External plugins for the DeepSeek Harness, kept standalone from the harness repo. Self-contained pnpm workspace.

## 插件清单 / Plugins

全部位于 `packages/` 下 / All under `packages/`:

| 目录 | 说明 | 依赖 account-hub |
|---|---|---|
| `dsh-plugin-account-hub` | 账号管理枢纽（官方宿主适配：hub API / 桌面 shim / UI 组件 ×2） | ——（本体） |
| `dsh-plugin-deepseek-account` | DeepSeek 官方账号插件（credential-inject 模式） | ✅ 必须 |
| `dsh-plugin-account-testcode` | TestCode 测试账号插件（direct 模式） | ✅ 必须 |
| `dsh-plugin-llama-local` | 本地 GGUF 推理插件：xLAM-2-3B-fc-r（函数调用）/ Qwen3-0.6B 兜底，node-llama-cpp 引擎，工具调用走别名注入 + 解析回环 | ✅ 必须 |
| `dsh-plugin-zcode-ability` | ZCode 移植容器：persona / skills / plan / workflow / environment（zCode之剑 预设）+ z.ai-account 账号 + 8 个技能 | ⚠️ 仅 z.ai-account |
| `dsh-plugin-qwen-ability` | Qwen 容器：账号 / persona / loop / environment（Qwen的折扇 预设） | ⚠️ 仅 qwen-account |
| `dsh-plugin-codex-ability` | Codex 容器：账号 / persona / loop / environment（Codex吐息 预设） | ⚠️ 仅 codex-account |

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

> **安装 account-hub 前注意**：hub 会屏蔽 dsh 自带的 DeepSeek 账号，并屏蔽模型中的
> 默认 DeepSeek API 模型组——请先确认默认模型组的 API 记录已保存、DeepSeek 账号已
> 登出，再安装；如需 DeepSeek 登录功能，请安装 `dsh-plugin-deepseek-account`。详见
> [account-hub README](./packages/dsh-plugin-account-hub/README.md)。
>
> **Before installing account-hub**: it hides the built-in DeepSeek account and the
> default DeepSeek API model group. Save those API records and sign out first; for
> DeepSeek sign-in install `dsh-plugin-deepseek-account`.

## ⚠️ 账号风险警告 / Account risk warning

**适用于需要登录的账号插件：`deepseek-account`、`codex-account`（订阅 OAuth）、
`z.ai-account`（OAuth）、`qwen-account`（API Key）。**

这些插件为官方客户端行为的**开源代码移植**：登录与请求流程已考虑指纹伪造（客户端
平台标识、User-Agent、设备标识等请求头），但**未经过长期压力测试**，无法保证不被
官方风控识别——**存在账号被限制或封禁的风险，请酌情使用**。建议不要绑定重要账号，
因使用本插件产生的账号后果由使用者自行承担。

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
