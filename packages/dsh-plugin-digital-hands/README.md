# dsh-plugin-digital-hands（数据手）

DeepSeek Harness 的工具管理组件：**声明式工具方案 + 全目录检索**。

## 它做什么

- **受管 MCP**：方案里声明的 MCP 服务器由数据手用官方同款 SDK（`@modelcontextprotocol/client`）连接，发现的工具以一等公民身份注册进宿主工具表（`mcp__<server>__<tool>` 命名，与官方 mcp-client 同一契约）——模型**直接调用**，审批/超时/取消/错误投影全部继承宿主管线。
- **脚本工具**：方案里指路径的本地 ES 模块（导出 `{name, description, parameters, execute}`），同样以原生工具注册。
- **tool_search**：恒定 schema 的目录工具，检索受管工具（含方案里的富文档）与所有已挂载原生工具。它只读不写——不改工具集，不做门禁。
- **共存**：不碰 profile 的官方 MCP 配置、不动其他插件的注册、不改任何 agent 预设。按原方式（bundle + 预设行）挂载的工具照常工作。

## 方案（Plan）

一个方案 = 一份 YAML，声明这批会话可用的工具组合：

```yaml
name: my-plan
servers:
  - name: gitee
    transport: stdio
    command: npx
    args: ["-y", "@some/mcp-gitee"]
  - name: search
    transport: streamable-http
    url: http://127.0.0.1:8080/mcp
    headers: { Authorization: "Bearer ..." }
scripts:
  - path: ~/tools/quote-calc.js
docs:
  mcp__gitee__create_issue: |
    建 issue 的扩展说明、示例、坑位 —— 经 tool_search 提供。
```

方案解析顺序：`config.plans`（内联）> `config.plan`（命名文件）> 无 config 时的 `default.yml`。命名文件放 `$DSH_HOME/digital-hands/plans/`（默认 `~/.dsh/digital-hands/plans/`）。

### 与 agent 预设配合

组件行默认挂在预设外（安装级，切预设不丢）。想让某预设用不同组合：把组件行移进该预设的 `plugins` 列表并带 `config.plan`：

```yaml
- id: digital-hands
  name: 'dsh-plugin-digital-hands'
  inject: [tools]
  config:
    plan: procurement
```

## 脚本工具协议

```js
export default {
  name: 'quote_calc',
  description: '按材料行计算报价。',
  parameters: { lines: { type: 'array', required: true, description: '材料行' } },
  async execute(args) { return { ok: true, total: 42 } },
}
```

`default` 可以是单个定义或定义数组；`docs` 字段（字符串）可选，经 tool_search 暴露。

## 依赖

需要 DeepSeek Harness ≥ 0.2.0-rc.2。无其他运行时依赖（MCP SDK + YAML 解析器随包装载）。

## 风险与边界（v1）

- MCP 服务器连接失败只标记不可用，不做自动重连（官方 mcp-client 有倍增重连，v2 对齐）。
- 工具结果中的图片块降级为诊断文本（原始 base64 保留在结构化结果里）。
- 子进程环境会剔除 `DSH_*` 与常见凭证形态的环境变量名。
