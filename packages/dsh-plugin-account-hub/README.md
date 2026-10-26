# dsh-plugin-account-hub

账号管理枢纽：为外部账号插件提供统一的账号卡片界面（hub API / 桌面 shim /
UI 组件），是本仓库所有账号插件的宿主。

## ⚠️ 安装前必读 / Read before installing

安装本插件后，hub 会接管官方界面：

- **接管设置里的账号页**（官方账号页 UI 禁用，hub 绘制 DeepSeek 卡片与第三方账号卡片）；
- **接管设置里的模型页**（使用 rc3 模型页自有副本，保留 hub 的 provider-card 扩展接口）；
- **禁用官方默认的 DeepSeek API（API Key）模型组**。

官方 DeepSeek 账号宿主（登录、令牌、`remote.account`、welcome）保持启用，
hub 只是替换账号页与模型页的界面。DeepSeek 账号的模型卡片使用官方 provider 数据；
未登录账号与未加载的本地模型不会显示模型卡片。

After installation the hub takes over the settings account and models pages:
the official account **UI** is disabled (the host and login stay), the models
page is served by this container, and the default DeepSeek API-key model group
is removed. The official DeepSeek account host (login, credentials,
`remote.account`, welcome) remains enabled. Model cards for signed-out accounts
and unloaded local models are hidden.

## 功能拓展 / What this plugin adds

本插件是 dsh 插件化功能拓展的入口：以插件形式为 dsh 提供账号管理界面与本地模型
接口——配合 `dsh-plugin-llama-local` 等插件，**无需安装其他应用**，即可在 dsh 内
直接调用本地 GGUF 模型，并可按需挂载 Qwen / Codex / Z.ai 等第三方账号插件。

The hub is the entry point of the plugin-based extension: it brings plugin-form
account management and a local-model interface into dsh — with plugins such as
`dsh-plugin-llama-local` you can run local GGUF models inside dsh without
installing any other application, and attach third-party account plugins (Qwen /
Codex / Z.ai) as needed.
