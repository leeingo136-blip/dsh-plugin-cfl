// 决定性诊断：直接调 chatWrapper.generateContextState，打印拼入模型的完整 prompt，
// 确认 # Tools 工具段是否真的注入了。注入成功 → 问题在 0.6B 模型能力；
// 没注入 → 问题在 node-llama-cpp 的 functions 注入配置。
import { getLlama, QwenChatWrapper } from 'node-llama-cpp'

const llama = await getLlama()
const chatWrapper = new QwenChatWrapper({ variation: '3', thoughts: 'discourage' })
const history = [
  { type: 'system', text: '你是一个助手。' },
  { type: 'user', text: '北京今天天气怎么样？' },
]
const availableFunctions = {
  get_weather: {
    description: '获取指定城市的当前天气（温度与天气状况）',
    params: {
      type: 'object',
      properties: { city: { type: 'string', description: '城市名称' } },
      required: ['city'],
    },
  },
}
const state = chatWrapper.generateContextState({
  chatHistory: history,
  availableFunctions,
  documentFunctionParams: true,
})
console.log('返回对象键:', Object.keys(state))
const text = state.contextText?.toString?.()
  ?? state.toString?.()
  ?? JSON.stringify(state).slice(0, 3000)
console.log('\n=== 拼入模型的 prompt（节选）===')
console.log(text.slice(0, 1500))
await llama.dispose?.()
