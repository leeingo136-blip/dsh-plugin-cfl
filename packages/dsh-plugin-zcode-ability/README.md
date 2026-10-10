# dsh-plugin-zcode-ability

把 ZCode 的会话内能力搬进 DeepSeek Harness 的私有插件。一个能力一个组件，外加
「zCode之剑」预设把这些组件与移植来的技能装配成一棵能力树。

> ⚠️ **封号风险提示（仅 z.ai-account）**：该组件为官方客户端行为的开源代码移植，
> 登录与请求流程已考虑指纹伪造，但未经过长期压力测试，存在账号被限制或封禁的风险，
> 请酌情使用，不要绑定重要账号。persona / skills / plan / workflow / environment
> 不涉及账号，无此风险。

**边界**：只写插件，不改动 harness 任何源码。harness 提供的全部是已发布接口
（`accountHub.register`、`ctx.llm.*`、`ctx.systemPrompt.*`、`ctx.tools.*`、`ctx.credentials`、
agent preset 声明）。`deepseek-harness/` 只用于查看接口与构建依赖链接。

## 1. 结构：一个能力一个组件

```
dsh-plugin-zcode-ability/                      # 容器：只有装载层，没有逻辑
├── package.json                  # 只声明 dsh.bundle.patch（指向自己的 cordis.patch.yml）
├── cordis.patch.yml              # 装载层：账号行 + 预设行「zCode之剑」
├── setup-links.sh                # @deepseek-ai/* 链接 + 六个组件包的自链接（互相按包名解析）
├── skills/                       # 移植来的 ZCode 技能树（与 harness 去重的那份，8 个）
│   ├── agent-browser/  ai-elements/  control-browser/  dogfood/
│   ├── electron/  feature-boundary-planner/  vercel-react-best-practices/  web-gui-tester/
├── dsh-plugin-zcode-persona/       # 组件包：ZCode 工作姿态（提示词段）
├── dsh-plugin-zcode-skills/        # 组件包：技能门禁（提醒式，非否决）
├── dsh-plugin-zcode-plan/          # 组件包：计划纪律（提示词段）
├── dsh-plugin-zcode-workflow/      # 组件包：工作流纪律（提示词段）
├── dsh-plugin-zcode-environment/        # 组件包：「zCode之剑」预设本体
│   └── src/{index,definition}.ts # 注册服务 + 能力树（程序化备选路径）
└── dsh-plugin-z.ai-account/        # 组件包：Z.ai / GLM 账号
    ├── package.json
    └── src/{index,adapter,card,protocol}.ts + assets/zai-logo.svg
```

> **依赖 account-hub**：`z.ai-account` 的账号卡片注册在 dsh-plugin-account-hub 的
> 「设置-账号」界面，须与 account-hub 同时安装；其余五个组件（persona / skills /
> plan / workflow / environment）不依赖 hub，可独立使用。

六个**嵌套组件包**各有自己的包名，装载行直接写包名——组件因此是可单独寻址、
单独回退的实体。**没有任何两个包之间有 import 关系**（唯一的共享件是
`zcode-skills` 自己的 `context.ts`，一个 15 行的类型增强；预设不引用任何组件包，
它按自己的 `import.meta.url` 定位 `skills/`）：

| 组件包 | 装载行 `name:` | 形态 |
|---|---|---|
| `dsh-plugin-zcode-persona` | `dsh-plugin-zcode-persona` | 会话级，预设树内 `zcode-persona` |
| `dsh-plugin-zcode-skills` | `dsh-plugin-zcode-skills` | 会话级，预设树内 `zcode-skills` |
| `dsh-plugin-zcode-plan` | `dsh-plugin-zcode-plan` | 会话级，在 `planning` 组内 |
| `dsh-plugin-zcode-workflow` | `dsh-plugin-zcode-workflow` | 会话级，在 `delegation` 组内 |
| `dsh-plugin-zcode-environment` | `dsh-plugin-zcode-environment` | 预设本体（注册到 `agentPresets`） |
| `dsh-plugin-z.ai-account` | `dsh-plugin-z.ai-account` | 账号、provider、模型目录、账号卡 |

预设不是容器内的一整块声明：它是自己的组件包，与四个能力组件、账号组件同层命名。
四个能力组件**不在 `cordis.patch.yml` 的顶层**——它们是预设树内部的 `zcode-*` 条目，
所以只在「zCode之剑」会话里存在，也不会出现在界面/日志的顶层插件列表上。

## 2. 归属层（不要放错）

| 组件 | 层 | 说明 |
|---|---|---|
| `dsh-plugin-z.ai-account` | **安装级** | 账号、provider、模型目录、账号卡。装了就在，切预设也还在 |
| `dsh-plugin-zcode-{persona,skills,plan,workflow}` | **会话级** | 只在选中「zCode之剑」的会话生效 |
| `dsh-plugin-zcode-environment` | 安装级 insert，产出会话级能力 | 预设本体；注册形状与官方 `@deepseek-ai/dsh-agent-preset` 一致（`static inject=agentPresets`、同名 Config 校验、`EntryGroup.key`） |
| `skill-filesystem` 的 `customSkillDirs` | **会话级**（预设内） | 只给这个预设补移植技能，不影响其它预设的技能目录 |

**账号绝不能进预设**：否则用户切到 `standard` 时账号就消失了。因此 `cordis.patch.yml`
里有两条 insert——账号一条、预设一条。

## 3. 依赖声明

本地形态不写 `dependencies`（harness 的包没有发布到 registry），由 `setup-links.sh` 把
`@deepseek-ai/*` 链接到仓库内的工作区包，并把六个组件包按自包名链接进容器 `node_modules`。
全包共用这一条脚本：

| 包 | 用途 | 缺失后果 |
|---|---|---|
| `@deepseek-ai/dsh-api-account-hub` | **账号枢纽：register / 卡片 / getState / invoke** | 卡片无处注册，账号功能整体不可用 |
| `@deepseek-ai/dsh-credentials` | 凭据持久化 | 登录态不落盘 |
| `@deepseek-ai/dsh-llm` | provider 目录、adapter 基类、消息构造 | provider 无法注册 |
| `@deepseek-ai/dsh-tools` | 工具侧类型（`tools/post-execute` 决策） | 类型解析失败 |
| `@deepseek-ai/cordis` + `cordis-plugin-loader` | 插件运行时（`cordis-plugin-loader` 在 `vendor/loader`） | 装载失败 |
| `@deepseek-ai/schemastery` | **Config 必须用 schemastery 的 `z`，不能用 zod** | volatile 字段不投影 → 模型页行消失 |
| `zod` | 响应校验 | 运行期报错 |

装载进部署另有**五处同步**：profile `package.json` 依赖、`node_modules/<包名>` 链接、
profile `cordis.patch.yml`（配置层 `zai-account-external` 只补参数）、`pnpm-lock.yaml`、
`node_modules/.pnpm/lock.yaml`。

## 4. 移植来的技能：去哪、去重了什么

`skills/` 里是移植进本包的 ZCode 技能树，由预设内的 `skill-filesystem` 以
`customSkillDirs` 挂成额外根（rank 300，排在 project 根之后、user 根之前）。
patch 里写的是**绝对路径**（本机部署形态），不是官方发行层那种 `!!js` 表达式：
`!!js` 在**预设内部的行**里求值失败会把整份 patch 连带预设一起丢掉，而账号行与预设行
在同一个 patch 文件里，第一行失败就没有第二行。
harness 自带 4 个 bundled（agent-experience、cordis-composition-reference、
cordis-plugin-development、editing-cordis-compositions）、3 个 office 技能，以及用户级
`~/.agents/skills` 里 14 个 `dsh-*`——**这 21 个与移植来的技能按名字逐项比对，交集为空，
所以一个都没删**。移植目录里保留的是 8 个：`agent-browser`、`ai-elements`、
`control-browser`、`dogfood`、`electron`、`feature-boundary-planner`、
`vercel-react-best-practices`、`web-gui-tester`。

三点是后来实测出来的，必须知道：

- **剔掉了 3 个空转技能**：`dynamic-workflows`、`architecture-governance`、`dep-refs` 的
  正文指向 harness 里**根本不存在的**东西——`CreateWorkflow/AmendWorkflow/SaveWorkflow/
  EvalWorkflowSnippet` 四个工具全仓零命中、`pnpm architecture:check` 与 `pnpm dep:refs`
  两个脚本不存在。技能能被加载，但照着正文执行必然失败，留着只会误导。
  判据是「命脉是否存在」，不是「名字有没有重」。
- `agent-browser` 这类技能正着复用了浏览器自动化，与 harness 的 `record-browser-gif` 是两回事，
  不是重复项；且 harness 官方只有 browser-use 那套 MCP/runtime，**没有 agent-browser CLI**，
  这条链是真增量（实测 `open`/`get text`/`click`/`screenshot` 全通，见第 9 节）。
- `control-browser` 正文里的 `agent.browsers` API、`feature-boundary-planner` 的
  "Map a ZCode behavior change" 定位句，在 harness 里没有对应物（前者 grep 零命中，
  后者换了仓库就对不上号）。这两份保留，但内容要按 harness 实际形态重写才算数。

## 5. 构建

```sh
sh ./setup-links.sh        # @deepseek-ai/* 链接 + 六个组件包自链接
find . -name '*.tsbuildinfo' -delete
for p in dsh-plugin-zcode-persona dsh-plugin-zcode-skills \
         dsh-plugin-zcode-plan \
         dsh-plugin-zcode-workflow \
         dsh-plugin-zcode-environment dsh-plugin-z.ai-account; do
  (cd "$p" && <harness>/node_modules/.bin/tsc -p tsconfig.build.json)
done
```

每个组件包是**独立 tsconfig**（`rootDir: src`、`outDir: dist`），各自产出自己的
`dist/index.js`——功能包不找任何资源，预设包靠 `../..` 找容器的 `skills/`，
账号包靠 `../assets` 找自己的 logo。
`incremental: false` 且每次先删 `*.tsbuildinfo`：否则 tsc 缓存会跳过 emit，改了源码却没产物。
入口必须产 `.js`（host 是纯 Node ESM，`.ts` 入口 `ERR_UNKNOWN_FILE_EXTENSION`）。

**六个包互不依赖，构建顺序任意**（这是拆成七包换来的）：没有跨包 `.d.ts` 流向，
因此也不存在 TS7016 那类顺序错误。

## 6. 装载（桌面 dev home）

`apps/desktop/.desktop-build/development/home/profiles/desktop/`：

1. `package.json` → `dependencies` 加**七条** `link:`（容器 + 六个组件包，
   组件包指向 `…/dsh-plugin-zcode-ability/<组件目录>`），
   `dsh.profile.bundles` 只加容器名（patch 只挂在容器上）；
2. `node_modules/` 建八处同名符号链接（非作用域包用绝对路径最省事）——装载行按包名解析，
   缺一条就是 entry 404；
3. `cordis.patch.yml` 保留 `- id: zai-account-external / config: {}`（配置层，entry 来自本包的 patch）；
4. `pnpm-lock.yaml` 与 `node_modules/.pnpm/lock.yaml` 同步 importer（两份都要）。

改完必须重启桌面：host boot 会快照 client 字节。

**⚠️ 最贵的坑：一条悬空软链会让整条 bundle 静默失效。** 删掉某个组件包而没删它的
`node_modules` 链接时，链接留在原地指向不存在的目录。profile 的 bundle 解析不到容器
包 → 容器的 `cordis.patch.yml` 整层被跳过，**账号行和预设行一起消失，日志里连 error 都没有**
（只有其它独立插件照常注册，很容易误判成"补丁写成错了"）。判据：

```sh
python3 -c "import os;print([n for b in ['…/dsh-plugin-zcode-ability/node_modules','…/profiles/desktop/node_modules'] for n in os.listdir(b) if os.path.islink(os.path.join(b,n)) and not os.path.exists(os.path.join(b,n))])"
```

重建链接前先 `rm` 掉旧链接（绝对路径链接必须先删后建，`ln -sf` 会在链接本身上开洞）。

## 7. 验收清单

- [ ] harness 侧 `git status` 无 tracked 改动（本插件只改未追踪的 dev home）。
- [ ] 删除预设行后，应用行为完全回到原样（可回退性是"没影响本体"的最强证据）。
- [ ] 用非 GLM 模型开 `standard` 会话：提示词与工具列表与装插件前一致。
- [ ] 选「zCode之剑」后：出现 zcode 段落；skill 目录里能列出移植来的技能；其它预设技能列表不变。
- [ ] 除 OAuth 本地回调（`127.0.0.1:<port>/oauth/zai/callback`）外，插件零出站域名。
- [ ] 未触碰迁移方案第十一章的外发清单（遥测 / 同步 / 反馈日志 / 会话分享）。

## 8. 当前边界（有意为之）

- **登录两条路**：Z.ai 浏览器 OAuth（授权码 + state 校验，回调走本地 HTTP）与 API Key
  直填（粘贴前先查一次 `/models` 校验）。两者都只把凭据交给 `ctx.credentials`，hub 永不见密钥。
- **推理协议**：OpenAI 兼容 chat completions（`baseURL` 可配）。GLM 另有 Anthropic 兼容端点，
  本版未实现该分支。
- **额度**：平台没有可依赖的余额端点，卡片余额行降级为"在控制台查看"外链，不编造数字。
- **协议未联调**：端点与授权参数取自 ZCode v3.14.3 源码，未经真实服务器验证。
- **技能门禁是提醒不是否决**：`tools/post-execute` 计数到阈值补一条 notice，刻意不给
  `tools-pre-execute` 否决——否决读起来像"这一轮被拦了"，而 ZCode 的原意只是提醒。
- **没有工具否决组件**：ZCode 的 per-turn disallowed 集合未移植。harness 侧的工具限制走官方
  三条路（`ctx.sandboxPolicy` 的 `read-only / workspace-write / danger-full-access`、
  `tools.guard()`、`tools.restrict()`），不再自造第四层——自造的静态 deny 名单名不附实、
  空名单静默放行，且永远弱于执行层的 sandbox 拦截。

## 9. 实测：移植技能哪几个真能用

在「zCode之剑」会话里实跑过一轮，证据取自会话记录（不是模型自述）：

- **能激活**：`skill` 工具被真调用，返回 `<skill_content name="agent-browser">`，
  其中 `Base directory` 指向本容器的 `skills/agent-browser` —— 证明加载的是移植技能而非
  harness bundled。此后 `command -v agent-browser`（0.25.4）→ `open data:text/html,ok` →
  `get text body`（`ok`）→ `screenshot`（1280×577 / 3982 B）→ `read_image` 回读 →
  `present` 交付，全程 `isError` 0 条。
- **不能激活**：`dynamic-workflows`、`architecture-governance`、`dep-refs` 已按上节判据删掉。

**取证常识**：dsh 的 system prompt 里**不列技能名**（实测 zCode之剑 会话首条 `system/message`
搜全部技能名 0 命中），技能是按需加载的。所以「移植功能被激活」不能用提示词取证，
只能看模型有没有真调 `skill` 工具、有没有真的执行对应命令。反过来，让模型「打印你的
工具列表」它只会从提示词里背一份——那不产生任何激活证据。
