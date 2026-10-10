# dsh-plugin-account-hub

账号管理枢纽：为外部账号插件提供统一的账号卡片界面（hub API / 桌面 shim /
UI 组件），是本仓库所有账号插件的宿主。

## ⚠️ 安装前必读 / Read before installing

安装本插件后，hub 会接管官方界面：

- **屏蔽 dsh 自带的 DeepSeek 账号**；
- **屏蔽模型中的默认 DeepSeek API 模型组**（由本插件的界面组件替换接管）。

因此请**先确认以下两点，再安装**：

1. 默认 DeepSeek API 模型组的 API 记录（Key 等）已保存完毕；
2. dsh 自带的 DeepSeek 账号已登出。

如果你仍需要 DeepSeek 登录功能，请安装本仓库的 DeepSeek 账号插件
`dsh-plugin-deepseek-account`（见仓库根 README 的安装说明）。

After installation the hub replaces the built-in account/model surfaces: the
built-in DeepSeek account is hidden and the default DeepSeek API model group is
removed from the model picker. Save the API records of that model group and sign
out of the built-in account **before** installing. For DeepSeek sign-in, install
`dsh-plugin-deepseek-account` instead.

## 功能拓展 / What this plugin adds

本插件是 dsh 插件化功能拓展的入口：以插件形式为 dsh 提供账号管理界面与本地模型
接口——配合 `dsh-plugin-llama-local` 等插件，**无需安装其他应用**，即可在 dsh 内
直接调用本地 GGUF 模型，并可按需挂载 Qwen / Codex / Z.ai 等第三方账号插件。

The hub is the entry point of the plugin-based extension: it brings plugin-form
account management and a local-model interface into dsh — with plugins such as
`dsh-plugin-llama-local` you can run local GGUF models inside dsh without
installing any other application, and attach third-party account plugins (Qwen /
Codex / Z.ai) as needed.
