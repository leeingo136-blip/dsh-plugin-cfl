// 诊断版：显式用内置 QwenChatWrapper（而非 GGUF 自带 jinja），抑制思考，
// 打印完整原始输出，判断 0.6B 到底有没有走工具调用格式。
import { getLlama, LlamaChatSession, QwenChatWrapper } from 'node-llama-cpp'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const MODEL = 'Qwen3-0.6B-Q4_K_M.gguf'
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)))
const MODEL_PATH = join(PACKAGE_ROOT, 'models', MODEL)

const functions = {
  get_weather: {
    description: '获取指定城市的当前天气（温度与天气状况）',
    params: {
      type: 'object',
      properties: { city: { type: 'string', description: '城市名称，例如 北京' } },
      required: ['city'],
    },
    handler: async ({ city }) => `${city}：晴，26°C，东南风 2 级`,
  },
  calculate: {
    description: '计算一个算术表达式的值',
    params: {
      type: 'object',
      properties: { expression: { type: 'string', description: '例如 "123 * 456"' } },
      required: ['expression'],
    },
    handler: async ({ expression }) => {
      try {
        const value = Function('"use strict"; return (' + expression + ')')()
        return `计算结果：${value}`
      } catch (e) {
        return `无法计算：${e.message}`
      }
    },
  },
  get_current_time: {
    description: '获取当前系统时间',
    params: { type: 'object', properties: {} },
    handler: async () => new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
  },
}

const TESTS = [
  '北京今天天气怎么样？',
  '帮我算一下 123 乘以 456 等于多少。',
  '现在几点了？',
]

const llama = await getLlama()
const model = await llama.loadModel({ modelPath: MODEL_PATH })
console.log(`模型已加载：${MODEL}\n`)

for (const [i, prompt] of TESTS.entries()) {
  const context = await model.createContext({ contextSize: 4096 })
  // 显式内置 wrapper：启用 _requireFunctionCallSettingsExtraction，并抑制思考。
  const chatWrapper = new QwenChatWrapper({ variation: '3', thoughts: 'discourage' })
  const session = new LlamaChatSession({ contextSequence: context.getSequence(), chatWrapper })
  process.stdout.write(`\n[${i + 1}] 用户: ${prompt}\n`)
  const res = await session.promptWithMeta(prompt, {
    functions,
    maxTokens: 2048,
    temperature: 0.7,
    documentFunctionParams: true,
    maxParallelFunctionCalls: 1,
  })
  // 拼接所有文本项（含 <think> / <tool_call> 原文），看模型究竟输出了什么。
  const rawText = res.response
    .filter((item) => typeof item === 'string')
    .join('')
  let toolHit = false
  for (const item of res.response) {
    if (item && typeof item === 'object' && 'functionName' in item) {
      toolHit = true
      process.stdout.write(`   → 工具调用: ${item.functionName}(${JSON.stringify(item.params ?? {})})\n`)
    }
  }
  const hasToolCallTag = rawText.includes('<tool_call>') || rawText.includes('"name"')
  process.stdout.write(`   完整原始输出: ${rawText.slice(0, 600) || '(空)'}\n`)
  process.stdout.write(`   stopReason=${res.stopReason}  触发工具=${toolHit}  含tool_call标记=${hasToolCallTag}\n`)
  await context.dispose()
}
await model.dispose?.()
await llama.dispose?.()
