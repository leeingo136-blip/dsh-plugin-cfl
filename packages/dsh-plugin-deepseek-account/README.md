# dsh-plugin-deepseek-account

DeepSeek 官方账号的外部化插件：将官方 App 内置的账号组件替换为外部实现，支持
OAuth 订阅登录与平台 API Key（credential-inject 模式，anthropic 线协议由宿主
PiAiAdapter 承接）。

> **依赖 account-hub**：账号卡片注册在 dsh-plugin-account-hub 的「设置-账号」界面，
> 必须与 account-hub 一起安装。

## ⚠️ 封号风险提示 / Account ban risk

本插件为官方客户端行为的**开源代码移植**：登录与请求流程已考虑指纹伪造（客户端
平台标识、User-Agent、设备标识等请求头），但**未经过长期压力测试**，无法保证不被
官方风控识别——**存在账号被限制或封禁的风险，请酌情使用**。建议不要绑定重要账号，
因使用本插件产生的账号后果由使用者自行承担。

*This is an open-source port of official client behaviour. Fingerprint spoofing
is taken into account but has not been stress-tested long term; there is a real
risk of account restriction or ban. Use at your own discretion and not with
accounts you cannot afford to lose.*
