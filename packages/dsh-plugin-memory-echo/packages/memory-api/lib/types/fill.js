/**
 * 历史填充：选中角色预设后，用脚本 provider 让 loop 真实地跑完 seed 多轮，
 * assistant 事件由 loop 写入（合法 stream），完成后恢复真实路由。
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConnectionStore, dataRoot } from "./connections.js";
import { listChunks } from "./query.js";
import { SCRIPT_MODEL, SCRIPT_PROVIDER } from "./mock.js";
function report(state) {
    try {
        const dir = dataRoot();
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'fill-status.json'), JSON.stringify({ at: new Date().toISOString(), ...state }, null, 2));
    }
    catch { /* ignore */ }
}
function dialogPairs(address) {
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
    return { users, assistants };
}
export function startFill(ctx, adapter) {
    const store = new ConnectionStore();
    const pending = new Map();
    const agents = new Map();
    let current;
    const realRoutes = new Map();
    const advance = (fill) => {
        const agent = agents.get(fill.sessionId);
        if (agent === undefined || agent.followup === undefined)
            return;
        if (fill.index >= fill.users.length) {
            fill.done = true;
            current = undefined;
            // 显式把模型选择写回会话：仅改 request 配置不会更新选择器/header。
            const session = agents.get(fill.sessionId)?.session;
            let real = fill.sessionId === undefined ? undefined : realRoutes.get(fill.sessionId);
            if (real === undefined) {
                const events = agents.get(fill.sessionId)?.session?.events ?? [];
                for (const event of [...events].reverse()) {
                    if (event.type !== 'model/selection')
                        continue;
                    const data = event.data;
                    if (typeof data?.provider === 'string' && typeof data?.model === 'string') {
                        real = { provider: data.provider, model: data.model };
                        break;
                    }
                }
            }
            if (session?.append !== undefined && real !== undefined) {
                try {
                    session.append('model/selection', { provider: real.provider, model: real.model });
                }
                catch { /* ignore */ }
            }
            report({ state: 'finished', session: fill.sessionId });
            return;
        }
        const user = fill.users[fill.index];
        if (user === undefined)
            return;
        agent.followup(createUserMessage({ content: [{ type: 'text', text: user }], source: { kind: 'user' } }));
        report({ state: 'turn', session: fill.sessionId, index: fill.index });
    };
    const onSessionEvent = (session, event) => {
        try {
            if (event.type === 'model/selection') {
                // 首条消息被丢弃后不会有真实 assistant，路由只能从选择事件取。
                const data = event.data;
                if (typeof data?.provider === 'string' && typeof data?.model === 'string') {
                    realRoutes.set(session.id, { provider: data.provider, model: data.model });
                }
                return;
            }
            if (event.type === 'agent-preset/selected') {
                const plan = typeof event.data?.agentPreset === 'string' ? event.data.agentPreset : '';
                const card = store.list().find(one => one.plan === plan);
                if (card === undefined)
                    return;
                const pairs = dialogPairs(card.address);
                if (pairs.users.length === 0) {
                    report({ state: 'empty-db', plan });
                    return;
                }
                pending.set(session.id, pairs);
                report({ state: 'queued', session: session.id, plan, turns: pairs.users.length });
                return;
            }
            if (event.type === 'assistant/message') {
                const msg = event.data?.message;
                const src = msg?.source;
                if (src?.provider !== undefined && src.provider !== SCRIPT_PROVIDER && typeof src.model === 'string') {
                    realRoutes.set(session.id, { provider: src.provider, model: src.model });
                }
                if (current !== undefined) {
                    if (src?.provider !== SCRIPT_PROVIDER)
                        return;
                    const fill = current;
                    fill.index += 1;
                    // 同样不能在 append 发布中重入：延后到事件结束后再发下一条。
                    setTimeout(() => { if (current === fill && !fill.done)
                        advance(fill); }, 0);
                }
            }
        }
        catch (error) {
            report({ state: 'error', message: error instanceof Error ? error.message : String(error) });
        }
    };
    const start = (sessionId, pairs) => {
        // 记住真实路由，填充结束后必须还回去（header 会被替换后的配置覆盖）。
        const session = agents.get(sessionId)?.session;
        const selection = [...(session?.events ?? [])].reverse().find(one => one.type === 'model/selection');
        const data = selection?.data;
        if (typeof data?.provider === 'string' && typeof data?.model === 'string') {
            realRoutes.set(sessionId, { provider: data.provider, model: data.model });
        }
        adapter.load(pairs.assistants);
        current = { sessionId, users: pairs.users, assistants: pairs.assistants, index: 0, done: false };
        advance(current);
    };
    const onCreated = (payload) => {
        try {
            const session = payload.agent.session;
            if (session === undefined)
                return;
            agents.set(session.id, payload.agent);
            // 等用户发第一条消息、该轮结束后再开始填充（此时 agent 已就绪）。
        }
        catch (error) {
            report({ state: 'error', message: error instanceof Error ? error.message : String(error) });
        }
    };
    /** 同时覆盖顶层与嵌套 config，避免 header 形态不同导致路由改不回来。 */
    const force = (base, provider, model) => {
        const out = { ...base, provider, model };
        const nested = base.config;
        if (nested !== null && typeof nested === 'object') {
            const inner = { ...nested };
            delete inner.reasoningEffort;
            if (provider === SCRIPT_PROVIDER)
                delete out.reasoningEffort;
            out.config = { ...inner, provider, model };
        }
        if (provider === SCRIPT_PROVIDER)
            delete out.reasoningEffort;
        return out;
    };
    const onRequest = async (payload, next) => {
        const base = await next();
        try {
            const sessionId = payload.agent.session?.id;
            if (sessionId !== undefined && current !== undefined && current.sessionId === sessionId && !current.done) {
                return force(base, SCRIPT_PROVIDER, SCRIPT_MODEL);
            }
            const real = sessionId === undefined ? undefined : realRoutes.get(sessionId);
            if (real !== undefined && (base.provider === SCRIPT_PROVIDER || base.config?.provider === SCRIPT_PROVIDER)) {
                return force(base, real.provider, real.model);
            }
            return base;
        }
        catch {
            return base;
        }
    };
    const onPreStep = async (payload, next) => {
        const decision = await next();
        try {
            const sessionId = payload.agent.session?.id;
            if (sessionId === undefined)
                return decision;
            const pairs = pending.get(sessionId);
            if (pairs === undefined || payload.turn !== 1 || payload.step !== 1)
                return decision;
            pending.delete(sessionId);
            // 丢弃触发用的首条消息：不进入历史，也不调用真实模型。
            setTimeout(() => { if (current === undefined)
                start(sessionId, pairs); }, 0);
            return { kind: 'reject' };
        }
        catch {
            return decision;
        }
    };
    const on = ctx;
    const off1 = on.on('session/event', onSessionEvent);
    const off2 = on.on('agent/created', onCreated);
    const off3 = on.on('agent/request', onRequest);
    const off4 = on.on('agent/pre-step', onPreStep);
    return () => { off1(); off2(); off3(); off4(); };
}
//# sourceMappingURL=fill.js.map