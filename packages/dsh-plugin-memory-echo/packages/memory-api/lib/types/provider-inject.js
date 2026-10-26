/** 前置会话注入：直接调用真实 provider 生成 assistant 事件（不替换会话路由）。 */
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConnectionStore, dataRoot } from "./connections.js";
import { listChunks } from "./query.js";
function pairsFor(address) {
    const rows = [...listChunks(address)]
        .filter(row => row.kind === 'user' || row.kind === 'assistant')
        .sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)) || a.id - b.id);
    const users = [];
    const assistants = [];
    for (const row of rows) {
        if (row.kind === 'user')
            users.push(row.content);
        else if (users.length > assistants.length)
            assistants.push(row.content);
    }
    return { users: users.slice(0, 6), assistants: assistants.slice(0, 6) };
}
function routeOf(session) {
    for (const event of [...(session.events ?? [])].reverse()) {
        if (event.type !== 'model/selection')
            continue;
        const data = event.data;
        if (typeof data?.provider === 'string' && typeof data?.model === 'string')
            return { provider: data.provider, model: data.model };
    }
    return undefined;
}
export function startProviderInjection(ctx) {
    const store = new ConnectionStore();
    const done = new Set();
    const llm = ctx.get('llm');
    const inject = async (session, plan) => {
        const card = store.list().find(one => one.plan === plan);
        if (card === undefined)
            return;
        const pairs = pairsFor(card.address);
        const route = routeOf(session);
        if (route === undefined || pairs.users.length === 0)
            return;
        for (let i = 0; i < pairs.users.length; i += 1) {
            const user = pairs.users[i];
            const reply = pairs.assistants[i];
            if (user === undefined)
                break;
            session.append('user/message', createUserMessage({ content: [{ type: 'text', text: user }], source: { kind: 'user' } }), { surfaceOp: 'append' });
            if (reply === undefined || llm === undefined)
                continue;
            try {
                const assembler = new BlockAssembler();
                for await (const chunk of llm.stream({ ...route, messages: [{ role: 'user', content: [{ type: 'text', text: `请原样输出下面这段文字，不要添加任何内容：\n${reply}` }] }], temperature: 0 })) {
                    assembler.push(chunk);
                }
                const message = assembler.message({ provider: route.provider, model: route.model });
                session.append('assistant/message', {
                    turn: 1, step: 1,
                    message,
                    usage: assembler.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                    stream: [],
                }, { surfaceOp: 'append' });
            }
            catch { /* 单条失败继续下一条 */ }
        }
    };
    const onPreStep = async (payload, next) => {
        const decision = await next();
        try {
            const session = payload.agent.session;
            if (session === undefined || payload.turn !== 1 || payload.step !== 1 || decision.kind !== 'enter')
                return decision;
            if (done.has(session.id))
                return decision;
            done.add(session.id);
            if ((session.events ?? []).some(one => one.type === 'user/message'))
                return decision;
            const selected = [...(session.events ?? [])].reverse().find(one => one.type === 'agent-preset/selected');
            const plan = typeof selected?.data?.agentPreset === 'string' ? selected.data.agentPreset : '';
            if (plan === '')
                return decision;
            // 在用户消息被接纳之前写入历史，使其排在这句话之前。
            await inject(session, plan);
            return decision;
        }
        catch {
            return decision;
        }
    };
    return ctx.on('agent/pre-step', onPreStep);
}
void readFileSync;
void join;
void dataRoot;
//# sourceMappingURL=provider-inject.js.map