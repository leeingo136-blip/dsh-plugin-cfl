# 本地 ONNX 账号插件（dsh-private-plugin-local-onnx）

把一个 Qwen3-0.6B 模型以**账号插件**的形式接进 Harness，推理全程在宿主进程内完成：不联网、不调外部 API、不需要任何账号凭据。

插件自带运行时依赖与权重，装好即可用，**不需要用户在目标机上再安装任何东西**，也**不修改任何 Harness 源码**。

---

## 一、它是什么

在设置-账号页出现一张「本地 Qwen3 模型」卡片，只有一个「启用本地模型」按钮。启用后：

- 设置-模型页出现 `本地 Qwen3` 分组，内含模型 `Qwen3-0.6B（本地）`；
- 主页模型选择器可以选到它；
- 对话时由本机 CPU 直接解码，逐字流式返回。

它是一个 `workMode: 'direct'` 的账号插件——回复由适配器自己产出，不走任何 HTTP。

之所以借账号插件这条路，是因为这是 Harness 唯一开放的、能让外部包接管对话的接口；本地模型没有凭据可注入，`credential-inject` 模式对它不适用。

---

## 二、目录结构

```
dsh-plugin-local-onnx/
├── dist/                  # 编译产物（tsc 产出，插件的 main）
├── models/                # 权重：onnx-community/Qwen3-0.6B-ONNX/…   606 MB
├── node_modules/          # vendor 依赖：transformers.js + ONNX Runtime   484 MB
├── scripts/fetch-model.mjs # 权重下载器（按精度下载）
├── setup-links.sh         # 建 @deepseek-ai/* 链接场（编译期需要）
├── install-plugin.sh      # 接入桌面 dev home（运行期需要）
├── cordis.patch.yml       # 插件自身的装载层
└── src/
    ├── index.ts           # Service + LlmAdapter + 账号卡
    └── local-model.ts     # 推理引擎：懒加载、串行队列、流式桥接、思考块拆分
```

`models/` 与 `node_modules/` 都由 `import.meta.url` 在运行时定位，不依赖进程工作目录，也不依赖任何环境变量。

> 当前体积合计约 **1.1 GB**（权重 606 MB + 依赖 484 MB）。

---

## 三、安装

三步，每步都是幂等的。

```bash
cd dsh-plugin-local-onnx

# 1. 编译期：链接 Harness 的工作区包（类型来源，不是拷贝）
sh setup-links.sh

# 2. 权重：下载 int8 精度（617 MB）。换精度见下节。
node scripts/fetch-model.mjs

# 3. 编译
rm -rf dist && ../deepseek-harness/node_modules/.bin/tsc -p tsconfig.build.json

# 4. 接入桌面 dev home（只改 git-ignored 的运行时产物，不改源码）
sh install-plugin.sh
```

然后重启桌面应用。本机用：

```bash
cd ../deepseek-harness
env -u ELECTRON_RUN_AS_NODE CODEBUDDY_SAFE_DELETE_ENABLED=0 NODE_OPTIONS= CI=true corepack pnpm run start:desktop
```

**为什么第 1 步必须是软链**：插件要按它即将运行的那一版 Harness 来编译。拷贝一份 Harness 类型进来，等于让插件对 Harness 持有第二套认知，版本一漂就出静默故障。

---

## 四、切换精度

`src/local-model.ts` 里的常量 `DTYPE` 决定加载哪个文件，必须与下载时选的一致。

| 精度 | 体积 | 说明 |
|---|---|---|
| `int8` | 617 MB | **默认**。各后端都跑得稳，掉点比 4bit 少 |
| `q4f16` | 570 MB | 最小，但依赖 fp16 算子，部分 CPU 路径表现不佳 |
| `q4` | 919 MB | 兼容性最广，质量低于 int8 |
| `fp16` | 1203 MB | 参考精度，无实用必要 |

```bash
node scripts/fetch-model.mjs --list            # 查看实际体积
node scripts/fetch-model.mjs --dtype q4        # 换一种
node scripts/fetch-model.mjs --dtype q4 --force # 重下并清空旧目录
```

运行时若找不到 `DTYPE` 对应的文件，会按 `q4f16 → q4 → fp16` 依次回退；全都没有时，账号卡直接提示去执行下载脚本，而不是抛一个看不懂的异常。

---

## 五、实现取舍

**懒加载 + 预热。** transformers.js 是动态导入的，启用插件本身不付 ONNX Runtime 的加载成本。点「启用」后后台预热，卡片状态依次是 `加载中… → 已就绪`。

首次加载做三件事，之后权重常驻内存、请求不再重复：装载 ONNX Runtime 原生库 → 读入 617 MB 的 `model_int8.onnx` 并解析计算图 → ORT 建 session（图优化、kernel 选择、显存/内存分配器初始化）。本机（Apple Silicon + SSD）实测 **2.8 秒**完成预热，常驻 RSS **约 1.35 GB**；机械硬盘或内存吃紧的机器会明显更久。不使用本地模型时不会付这个成本——这正是预热放在「启用」而不是插件挂载时的原因。

**串行队列。** 一个 pipeline 实例持有同一套中间缓冲，两个重叠的生成会互相串字。所有请求排成一队，顺带避免多个会话同时分配 KV cache。

**输入裁剪。** Qwen3 的上下文是 40K，但 KV cache 是按请求分配的，超长历史会在 ORT 内部失败而不是降级。这里按 16,000 字符从**旧**的一侧裁剪——回复要接的是最近的几轮。

**思考块拆分。** Qwen3 会把推演写在 `<think>…</think>` 之间。适配器把它拆成独立的 reasoning 块，正文作为 text 块，标签可能跨 chunk 边界，所以做了悬挂前缀处理。用户看到的是折叠的「思考」而不是满屏草稿。

**不支持工具。** 0.6B 级模型没有可信的 function-calling，`resolveModel` 照实不声明工具能力（不虚标）。工具声明会被忽略而不是转发——转发只会招来畸形调用。

**输入只保留文本。** 图片、文件块被丢弃（模型只吃文本）；工具结果保留但加了 `[tool]` 前缀，模型至少能读懂发生了什么。

---

## 六、边界

- **零 Harness 改动**：`cordis.patch.yml` 是插件自己的装载层，不触碰 hub 或 Harness 任何源码。`install-plugin.sh` 改的是 `apps/desktop/.desktop-build/`（已被 gitignore 的运行时产物）。
- **不联网**：加载前把 `allowRemoteModels` 关掉，权重只从本地读。
- **路径不依赖 cwd**：全部由 `import.meta.url` 解析。
- **精度一致性**：`DTYPE` 常量与下载脚本的参数要对上，这是唯一需要人工照看的地方。

---

## 七、已知限制

- 只跑 CPU。`onnxruntime-node` 随包分发，但这里没有接 GPU EP。
- 跨平台分发时，`onnxruntime-node` 自带多平台二进制，比 llama.cpp 那类每平台各出一包的依赖好带；但它 484 MB 的体积是实打实的。
- 0.6B 模型只适合兜底、离线、隐私场景，别指望它跑 Agent 环路。
