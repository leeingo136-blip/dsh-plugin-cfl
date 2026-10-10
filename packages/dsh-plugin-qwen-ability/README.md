# dsh-plugin-qwen-ability

Qwen 容器：一个能力一个组件，由「Qwen的折扇」预设（preset id `qwen-code`）装配。

| 组件 | 说明 |
|---|---|
| `dsh-plugin-qwen-account` | Qwen 账号：API Key 登录（端点预设表按 plan × region 分流，OAuth 通道已于 2026-04 官方停用） |
| `dsh-plugin-qwen-persona` | Qwen Code 工作姿态（提示词段） |
| `dsh-plugin-qwen-loop` | 定时任务四工具（cron_* + loop_wakeup） |
| `dsh-plugin-qwen-environment` | 「Qwen的折扇」预设本体 |

> **依赖 account-hub**：仅 `qwen-account` 的账号卡片注册在 dsh-plugin-account-hub
> 的「设置-账号」界面，须与 account-hub 同时安装；persona / loop / environment
> 不依赖 hub，可独立使用。

## ⚠️ 封号风险提示 / Account ban risk

本插件为官方客户端行为的**开源代码移植**：登录与请求流程已考虑指纹伪造（客户端
平台标识、User-Agent、设备标识等请求头），但**未经过长期压力测试**，无法保证不被
官方风控识别——**存在账号被限制或封禁的风险，请酌情使用**。建议不要绑定重要账号，
因使用本插件产生的账号后果由使用者自行承担。

*This is an open-source port of official client behaviour. Fingerprint spoofing
is taken into account but has not been stress-tested long term; there is a real
risk of account restriction or ban. Use at your own discretion and not with
accounts you cannot afford to lose.*
