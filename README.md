# DSH Plugin Collection / DeepSeek Harness 外部插件集

DeepSeek Harness 的全部外部插件，独立于 harness 主仓库之外，pnpm workspace 自包含。

External plugins for the DeepSeek Harness, kept standalone from the harness repo. Self-contained pnpm workspace.

## 插件清单 / Plugins

全部位于 `packages/` 下 / All under `packages/`:

| 目录 | 说明 |
|---|---|
| `dsh-plugin-account-testcode` | TestCode 测试账号插件（direct 模式） |
| `dsh-plugin-deepseek-account` | DeepSeek 官方账号插件（credential-inject 模式） |
| `dsh-plugin-account-hub` | 账号管理枢纽（官方宿主适配：hub API / 桌面 shim / UI 组件 ×2） |
| `dsh-plugin-local-llama` | 本地 GGUF 推理插件：xLAM-2-3B-fc-r（函数调用）/ Qwen3-0.6B 兜底，node-llama-cpp 引擎，工具调用走别名注入 + 解析回环 |
| `dsh-plugin-zcode-ability` | ZCode 移植容器：persona / skills / plan / workflow / environment（zCode之剑 预设）+ z.ai-account 账号 + 8 个技能 |
| `dsh-plugin-qwen-ability` | Qwen 容器：账号 / persona / loop / environment（Qwen的折扇 预设） |
| `dsh-plugin-codex-ability` | Codex 容器：账号 / persona / loop / environment（Codex吐息 预设） |

## 仓库不含的内容 / Not included

- `node_modules/` —— 根目录 `pnpm install` 自包含重建（宿主依赖走 npm，pi-ai 0.87.1 经 patchedDependencies 修补）。
- `dist/` —— 构建产物，各包内重建：`tsc -p tsconfig.build.json`。
- `models/` —— 模型权重（单文件远超 Gitee 100MB 上限）。local-llama 权重用 `node scripts/fetch-model.mjs` 重新拉取。
- `.state/` —— 运行时状态（如 local-llama 的启用标记）。

## 构建与安装 / Build & install

1. 安装：仓库根 `pnpm install`（pnpm 11.x）。
2. 构建：各包 `tsc -p tsconfig.build.json`。
3. 装机：官方 App profile（`~/.dsh/profiles/desktop`）以 `link:` 指向各容器包，`pnpm install` 同步。
