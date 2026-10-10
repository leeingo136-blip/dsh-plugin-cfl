# 本地 GGUF 模型账号插件

在 Harness 内直接运行一个本地小模型，由 llama.cpp 在本进程内解码。不联网、不需要账号、不改动 Harness 源码。

> **依赖 account-hub**：本插件的账号卡片（启用/下载/状态显示）注册在 dsh-plugin-account-hub
> 的「设置-账号」界面里，必须与 account-hub 一起安装，单独安装本插件没有任何 UI 入口。
>
> **Requires account-hub**: the plugin's account card lives in dsh-plugin-account-hub's
> Settings-Account page and cannot be used without it.

默认加载 **xLAM-2-3B-fc-r**（Qwen2.5 底座，专为函数调用训练），可在 Harness 内触发技能/工具循环；若 `models/` 里没有 xLAM 权重，则自动回退到 **Qwen3-0.6B**（纯对话，不调用工具）。权重文件由 `scripts/fetch-model.mjs` 下载，不在仓库内。

## 一、为什么是 GGUF 而不是 ONNX

最早的版本用 ONNX Runtime + `Qwen3-0.6B-ONNX`，编译、加载都正常，但**一发消息应用立刻崩溃**（退出码 133，无任何报错）。原因是桌面壳跑的是 Electron，而原生模块是针对某个运行时的 ABI 编译的：

| 运行时 | Node 版本 | ABI 号 | 首次推理 |
|---|---|---|---|
| 系统 Node 22 | 22.22.2 | 127 | 正常 |
| 系统 Node 24 | 24.14.1 | 137 | 正常 |
| Electron 44（插件实际运行处） | 24.18.1 | **149** | **SIGTRAP 崩溃** |

加载能通过，真正解码时内存布局错乱。限制线程数无效，插件侧改代码也绕不过——这是编译层面的不匹配。

换成 llama.cpp 的绑定后同一进程一切正常（实测：加载 1.3 秒，生成 0.5–0.8 秒）。代价是原生二进制按平台分发，做不到"一个包通吃所有系统"。

> 中途试过纯 WASM 方案（`@wllama/wllama`）：它内部依赖浏览器的 `Worker` 与 `self` 全局，在 Node/Electron 主进程不存在，无法使用。

## 二、目录与装入方式

```
dsh-plugin-llama-local/
├── src/index.ts          # 服务 + adapter + 账号卡（direct 模式）
├── src/local-model.ts    # 推理引擎：懒加载、串行队列、流式桥接、思考块拆分
├── src/fetch-weights.ts  # 应用内权重下载器（启用时自动拉取，带镜像回退）
├── scripts/fetch-model.mjs  # 离线权重下载器（--list / --variant / --force）
├── models/               # 权重，不进仓库（xLAM 约 1.93 GB / Qwen3 约 484 MB）
├── node_modules/         # 运行时依赖，随包分发（含全平台预编译二进制）
└── install-plugin.sh     # 接入桌面 dev home
```

安装（npm 化流程，不再有软链场）：

```bash
# 仓库根：拉齐全部依赖（宿主依赖走 npm，llama 原生二进制按 supportedArchitectures 全平台安装）
pnpm install
npx tsc -p tsconfig.build.json       # 本包目录内构建
node scripts/fetch-model.mjs         # 预取权重（可选，应用内下载亦可）
```

随后在官方 App profile（`~/.dsh/profiles/desktop`）的 `package.json` 中加入本包与
dsh-plugin-account-hub 的 `link:` 依赖键和 bundle 行，`pnpm install` 同步。

## 三、权重

权重不进仓库（Gitee 单文件 100 MB 上限，单个 GGUF 均超限）。获取途径有两条：

**应用内自动下载（推荐）**：在「设置-账号」点「启用本地模型」，若 `models/` 下没有权重，插件自动开始下载默认 xLAM 权重，卡片状态显示 `下载中… 870 MB / 1.93 GB（45%）`；下载完成后自动启用并加载。下载失败会落成卡片上的「下载失败 · 原因」，再次点启用即重试；下载中途停用会中止传输。

**脚本离线下载**：装机前预取，或在无法联网的机器上手动拷入 `models/`：

```bash
node scripts/fetch-model.mjs                # 默认下载 xLAM-2-3B-fc-r-Q4_K_M.gguf（1.93 GB）
node scripts/fetch-model.mjs --list         # 列出全部变体与体积
node scripts/fetch-model.mjs --variant qwen3-0.6b   # 追加 Qwen3-0.6B-Q4_K_M.gguf（484 MB）
node scripts/fetch-model.mjs --force        # 强制重新下载
```

引擎启动时自动扫描 `models/` 下的 `.gguf`，两者并存时优先 xLAM；**换模型只是多下载一个文件，无需改代码、无需重新编译**。

## 四、使用

1. 重启应用 → **设置-账号** → 找到「本地模型」→ 点「启用本地模型」（权重缺失时自动下载，见第三节）；
2. 卡片状态 `下载中…（首次）/ 加载中… → 已就绪`；启用会发布注册中心变更事件，模型选择器的目录随即重载，无需重启；
3. 在模型选择器里选「本地模型」，发一句话。

停用后模型组从目录消失，权重也不再驻留内存。

## 五、实现取舍

**懒加载 + 预热。** node-llama-cpp 是动态导入的，插件挂载本身不付加载成本；点「启用」才在后台读入权重，失败会落成卡片状态而不是一句看不懂的异常。

**每次生成独立上下文。** 上下文持有 KV cache，跨轮复用会让无关会话读到彼此的状态；用完即释放。

**串行队列。** 引擎一次只跑一个生成，顺带避免多个会话同时分配 KV cache。

**预算要留够。** Qwen3 默认先输出思考块，token 预算太小会全部消耗在思考里、正文为空——默认 1024，可在设置里调。思考内容会自动拆成独立的推理块，界面上折叠显示。

**输入裁剪。** 上下文 8192 token，按 8000 字符从旧的一侧裁剪，system 消息永不裁切——回复要接的是最近的几轮。

**工具调用（仅 xLAM）。** xLAM-2-3B-fc-r 专为函数调用训练：插件向 system 注入带别名的工具清单，纯文本生成后解析其 JSON 输出为工具调用，驱动 Harness 的工具循环。Qwen3-0.6B 级别没有可信的 function-calling，回退到它时工具声明被忽略。

## 六、已知限制

- 原生二进制绑定平台：仓库以 `supportedArchitectures` 约定一次安装全平台预编译包
  （macOS Metal / Windows CPU·Vulkan·CUDA / Linux），运行时按平台与 GPU 自动选择后端，
  macOS 与 Windows 可共用同一份 `node_modules`；
- 纯 CPU 解码，长回复需要等待；
- 会话里若选过本模型，卸载后需手动把该会话切到其它模型（模型选择以字符串记录在会话里）。
