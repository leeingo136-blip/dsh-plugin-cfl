/** /StartCos：用模板事件为当前会话注入“前世”历史。 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot } from "./connections.js";
export const COMMAND = 'StartCos';
function templateFor(plan) {
    try {
        return readFileSync(join(dataRoot(), 'templates', `${plan}.jsonl`), 'utf8')
            .split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line));
    }
    catch {
        return [];
    }
}
/** 该预设是否有可用模板。 */
export function hasTemplate(plan) { return templateFor(plan).length > 0; }
export function startInjection(ctx) {
    const injecting = new Set();
    const onPreStep = async (payload, next) => {
        const decision = await next();
        try {
            const session = payload.agent.session;
            if (session === undefined || injecting.has(session.id))
                return decision;
            const text = (payload.messages ?? []).flatMap(m => (m.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '')).join('').trim();
            if (!text.startsWith(COMMAND))
                return decision;
            injecting.add(session.id);
            const selected = [...(session.events ?? [])].reverse().find(one => one.type === 'agent-preset/selected');
            const plan = typeof selected?.data?.agentPreset === 'string' ? selected.data.agentPreset : '';
            const events = plan === '' ? [] : templateFor(plan);
            // 命令本身不进入历史，也不调用模型。
            if (events.length > 0) {
                setTimeout(() => {
                    try {
                        session.append('turn/start', { turn: 1 });
                        session.append('step/start', { turn: 1, step: 1 });
                        for (const item of events) {
                            const data = item.type === 'assistant/message' ? { ...item.data, turn: 1, step: 1 } : item.data;
                            session.append(item.type, data, { surfaceOp: 'append' });
                        }
                        session.append('step/end', { turn: 1, step: 1 });
                        session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
                    }
                    catch { /* 注入失败忽略 */ }
                }, 0);
            }
            return { kind: 'reject' };
        }
        catch {
            return decision;
        }
    };
    return ctx.on('agent/pre-step', onPreStep);
}
//# sourceMappingURL=injection.js.map