/** 脚本化 LLM provider：供「历史填充」使用，由 loop 产出真实 assistant 事件。 */
import { LlmAdapter, type StreamChunk } from '@deepseek-ai/dsh-llm';
export declare const SCRIPT_PROVIDER = "memory-echo-script";
export declare const SCRIPT_MODEL = "script";
export declare class ScriptAdapter extends LlmAdapter {
    private queue;
    /** 按顺序装载每轮要播出的台词。 */
    load(texts: readonly string[]): void;
    providerInfo(provider: string): {
        id: string;
        name: string;
    };
    listModels(): Promise<readonly never[]>;
    resolveModel(provider: string, model: string): Promise<{
        provider: string;
        id: string;
        name: string;
        context: {
            contextWindow: number;
        };
    }>;
    stream(): AsyncIterable<StreamChunk>;
}
//# sourceMappingURL=mock.d.ts.map