# dsh-plugin-claude-ability

把 Claude Code 的账号接入搬进 DeepSeek Harness 的插件容器。一个能力一个组件，
外加「Claude心流」预设把这些组件装配成一棵能力树。

> **依赖 account-hub**：claude-account 的账号卡片注册在 dsh-plugin-account-hub
> 的「设置-账号」界面里，必须与 account-hub 一起安装，单独安装本容器没有任何 UI 入口。
>
> **Requires account-hub**: the account card lives in dsh-plugin-account-hub's
> Settings-Account page and cannot be used without it.

## 组件

| 组件 | 职责 |
|---|---|
| `dsh-plugin-claude-account` | Anthropic 订阅 OAuth（授权码 + PKCE，免回调粘贴模式）与 Console API Key 双路登录；登录前置出口 IP 地区 + 本机时区双重验证；订阅请求注入 `claude-cli` 身份头与 OAuth beta 头；路由走 pi-ai `anthropic-messages` |
| `dsh-plugin-claude-persona` | 自写 Claude 风格姿态提示词（借鉴公开行为规范的结构，非整段移植） |
| `dsh-plugin-claude-loop` | cron 四工具（cron_create / cron_list / cron_delete / loop_wakeup）与 `/loop` 技能 |
| `dsh-plugin-claude-environment` | 「Claude心流」（`claude-flow`）预设：标准能力树 + 上述组件 + 移植技能根 |

预设 id：`claude-flow`，显示名「Claude心流」。

## 登录设计

- **没有账号密码登录入口**——唯一凭据是用户在 Anthropic 自己页面上完成的
  OAuth 授权（粘贴模式：托管回调页展示 `code#state`，用户粘回卡片），
  或用户在 Anthropic Console 自建的 API Key（粘贴进卡片）。
- **登录前置验证**：发起 OAuth 前检查出口 IP 所在地区与所选「可用国家与地区」
  是否一致、本机时区是否属于该地区；不一致则拒绝发起，已登录状态下出口或时区
  变化会自动退出登录。
- 订阅模式模型表为静态目录（对齐官方 CLI 的离线 models.json 形态）；
  API Key 模式走 `GET /v1/models` 目录发现。

## ⚠️ 账号风险警告 / Account risk warning

本插件是**开源代码对官方客户端登录行为的移植**，虽已考虑指纹伪装
（`claude-cli` UA、身份头、OAuth beta 头），但**未经长期压力测试**，存在**封号风险**，
请酌情使用，后果使用者自担。建议不绑定重要账号。

**本插件的订阅 OAuth 通道风险高于本仓库其它账号插件**：Anthropic 未像 OpenAI
对 codex 后端那样官方开放第三方编程客户端接入——订阅 token 调推理端点属于灰色地带，
Anthropic 的风控以严格著称，检测后果可能是整个账号被封。**Console API Key 模式
完全合法（公开计费 API），推荐作为主要使用方式。**

This plugin is an open-source port of the official client's login behaviour.
Fingerprint spoofing is considered but not long-term stress-tested; account
ban is a real risk — use at your own discretion. The subscription-OAuth path
is greyer than this repo's other account plugins: Anthropic has not opened
third-party client access the way OpenAI did for codex. The Console API-key
mode is fully legitimate and recommended as the primary mode.
