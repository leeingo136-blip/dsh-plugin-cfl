# 本地向量模型插件（embedding-local）

在 Harness 内运行本地 GGUF 向量模型，供其他插件做文本嵌入（embedding）与相似度计算。不联网、不需要账号、不改动 Harness 源码。依赖 account-hub 提供账号卡片与模型页入口。

> **Embedding model identifiers** — how model ids are formed, resolved, and
> referenced by callers. 中文为主，关键术语附英文。

## 一、模型标识符（Model Identifier）

### 1.1 清单在制作时定死

模型清单**不是运行时配置**：打包时 `models/` 目录里的每个 `.gguf` 权重文件就是一个模型，**运行时不可增删**（无配置入口、无下载动作）。权重文件不进仓库（Gitee 单文件 100 MB 上限），由 `scripts/fetch-model.mjs` 预取或手工放入。

### 1.2 标识符规则

| 概念 | 规则 | 示例 |
|---|---|---|
| 文件 | `models/` 下的 `.gguf` 文件 | `bge-small-zh-v1.5-q8_0.gguf` |
| **模型标识符 id** | **文件名去掉 `.gguf` 后缀**（file stem） | `bge-small-zh-v1.5-q8_0` |
| 显示名 | `本地 ` + id 去掉量化后缀（正则 `[-.]q\d\w*$`） | `本地 bge-small-zh-v1.5` |

- 显示名同时用于账号卡片标题与模型页目录行，两处恒为同一字符串。
- id 大小写敏感、严格全等匹配，不做模糊/包含匹配。

### 1.3 解析规则（resolveModel）

调用方传 `modelId` 时的解析是**严格的**：

| 情形 | 结果 |
|---|---|
| `models/` 目录为空 | 抛 `no-model`（`ModelResolutionError`） |
| `modelId` 省略 | 取默认权重（见 1.4） |
| `modelId` 与某 id 全等 | 返回该权重 |
| `modelId` 未命中任何 id | 抛 `unknown-model`，文案含传入的 id |

### 1.4 默认权重选择

`modelId` 省略时，按文件名升序扫描 `models/`，取**第一个**文件名匹配嵌入权重模式 `/bge|embed|nomic|gte|e5/i` 的文件；一个都不匹配则取第一个 `.gguf`。当前默认：`bge-small-zh-v1.5-q8_0.gguf`（512 维）。

### 1.5 单模型服务

引擎一次只驻留一个权重。`embed` 指定与当前不同的 `modelId` 时，在串行队列的同一轮内完成「卸载旧权重 → 加载新权重」；向量维度由首次成功嵌入学习得到。

## 二、调用方式（其他插件）

```ts
static inject = ['embedding']   // EmbeddingService，服务名 'embedding'

const ctx.embedding.listModels()
// → [{ id: 'bge-small-zh-v1.5-q8_0', file: 'bge-small-zh-v1.5-q8_0.gguf', loaded: true }]

const [vector] = await ctx.embedding.embed(['要嵌入的文本'], 'bge-small-zh-v1.5-q8_0')
// vector: number[]（512 维）；modelId 省略时用默认权重

const score = ctx.embedding.similarity(vectorA, vectorB)   // 余弦相似度
ctx.embedding.isReady()                                    // 权重在盘且可加载
```

注意：

- 向量模型**不进对话模型列表**，主页模型下拉看不到它；模型页的行只是只读清单与加载门控。
- 模型页行跟随加载状态换入换出：未加载时无行；首次 `embed` 会按需（lazy）加载权重。
- 加载意图持久化在 Config 的 volatile `enabled` 字段：卡片点「加载向量模型」成功后落盘，重启后在后台自动恢复加载。

## 三、目录结构

```
dsh-plugin-embedding-local/
├── src/index.ts          # 服务 + 账号卡 + 模型页行门控
├── src/local-embed.ts    # 推理引擎：懒加载、串行队列、onLoadChange
├── scripts/fetch-model.mjs  # 离线权重下载器
├── models/               # 权重，不进仓库（bge-small-zh-v1.5-q8_0 约 100 MB）
└── locale/               # 卡片文案（en/zh）
```

构建：包目录内 `npx tsc -p tsconfig.build.json`；接入桌面 profile 见仓库根《账号插件开发文档.md》。
