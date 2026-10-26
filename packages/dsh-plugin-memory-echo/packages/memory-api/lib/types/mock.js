/** 脚本化 LLM provider：供「历史填充」使用，由 loop 产出真实 assistant 事件。 */
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
export const SCRIPT_PROVIDER = 'memory-echo-script';
export const SCRIPT_MODEL = 'script';
export class ScriptAdapter extends LlmAdapter {
    queue = [];
    /** 按顺序装载每轮要播出的台词。 */
    load(texts) {
        this.queue = [...texts];
    }
    providerInfo(provider) {
        return { id: provider, name: 'Memory Echo Script' };
    }
    async listModels() {
        return [];
    }
    async resolveModel(provider, model) {
        return {
            provider,
            id: model,
            name: 'Memory Echo Script',
            context: { contextWindow: 1_000_000 },
        };
    }
    async *stream() {
        const text = this.queue.shift() ?? '';
        yield { type: 'block-start', index: 0, blockType: 'text' };
        if (text !== '')
            yield { type: 'text-delta', index: 0, text };
        yield { type: 'block-end', index: 0, block: { type: 'text', text } };
        yield { type: 'usage', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
        yield { type: 'finish', reason: { kind: 'stop' } };
    }
}
//# sourceMappingURL=mock.js.map