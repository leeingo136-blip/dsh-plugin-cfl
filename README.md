# DeepSeek Harness 私有插件集 / Private Plugins for DeepSeek Harness

DeepSeek Harness（分支 PrivateModification）的全部私有外部插件，独立于 harness 主仓库之外。

All private external plugins for the DeepSeek Harness (`PrivateModification` branch), kept standalone from the harness repo.

## 插件清单 / Plugins

| 目录 | 说明 |
|---|---|
| `dsh-plugin-account-testcode` | TestCode 测试账号插件（direct 模式） |
| `dsh-plugin-deepseek-account` | DeepSeek 官方账号插件（credential-inject 模式） |
| `dsh-plugin-local-llama` | 本地 GGUF 推理插件：xLAM-2-3B-fc-r（函数调用）/ Qwen3-0.6B 兜底，node-llama-cpp 引擎，工具调用走别名注入 + 解析回环 |
| `dsh-private-plugin-zcode-ability` | ZCode 移植容器：persona / skills / plan / workflow / environment（zCode之剑 预设）+ z.ai-account 账号 + 8 个技能 |

## 仓库不含的内容 / Not included

- `node_modules/` —— 依赖经 `setup-links.sh` 软链到 harness 包，克隆后重建。
- `dist/` —— 构建产物，用 harness 的 tsc 重建：`tsc -p tsconfig.build.json`。
- `models/` —— 模型权重（单文件远超 Gitee 100MB 上限）。local-llama 权重用 `node scripts/fetch-model.mjs` 重新拉取。
- `.state/` —— 运行时状态（如 local-llama 的启用标记）。

## 构建与安装 / Build & install

1. 依赖软链：各插件目录执行 `./setup-links.sh`（建立 `@deepseek-ai/*` → harness 包的自链接）。
2. 构建：`tsc -p tsconfig.build.json`（使用 harness 仓库内 `node_modules/.bin/tsc`）。
3. 装机：按各插件 `install-plugin.sh` / 容器 `cordis.patch.yml` 说明，写入 dev-home profile。
