// 引擎层工具调用能力测试（绕过 dsh adapter，直连 node-llama-cpp 原生 functions API）。
// 目的：验证 Qwen3-0.6B-Q4_K_M 这个 0.6B 小模型本身是否具备 function calling 能力，
// 以及调用格式是否稳定。与 dsh 客户端无关——adapter 当前不转发 tools，故 UI 内测不出。
import { getLlama, LlamaChatSession } from 'node-llama-cpp'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const MODEL = 'Qwen3-0.6B-Q4_K_M.gguf'
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)))
const MODEL_PATH = join(PACKAGE_ROOT, 'models', MODEL)

// 三个工具：有参数 / 有参数且需计算 / 无参数，覆盖常见形态。
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
  '讲一个关于程序员的小笑话。', // 预期不调用任何工具，纯文本回复
]

const llama = await getLlama()
const model = await llama.loadModel({ modelPath: MODEL_PATH })
console.log(`模型已加载：${MODEL}\n`)

let pass = 0
let total = 0
for (const [i, prompt] of TESTS.entries()) {
  const context = await model.createContext({ contextSize: 4096 })
  const session = new LlamaChatSession({ contextSequence: context.getSequence() })
  process.stdout.write(`\n[${i + 1}] 用户: ${prompt}\n`)
  const res = await session.promptWithMeta(prompt, {
    functions,
    maxTokens: 1024,
    temperature: 0.3,
    documentFunctionParams: true,
    maxParallelFunctionCalls: 1,
  })
  let toolHit = false
  for (const item of res.response) {
    if (item && typeof item === 'object' && 'functionName' in item) {
      toolHit = true
      total += 1
      const fc = item
      process.stdout.write(`   → 工具调用: ${fc.functionName}(${JSON.stringify(fc.params ?? {})})\n`)
    } else if (typeof item === 'string') {
      const clean = item.replace(/<think>[\s\S]*?<\/think>/g, '[思考]').trim()
      if (clean) process.stdout.write(`   文本: ${clean.slice(0, 400)}\n`)
    }
  }
  if (toolHit) pass += 1
  process.stdout.write(`   stopReason=${res.stopReason}  触发工具=${toolHit}\n`)
  await context.dispose()
}
console.log(`\n=== 汇总：触发工具 ${pass}/${TESTS.length} 条；其中工具调用总数 ${total} 次 ===`)
await model.dispose?.()
await llama.dispose?.()
