/**
 * Loop component: the Claude scheduling toolset and its session scheduler.
 *
 * Ported from claude (Apache-2.0): `cron_create` / `cron_list` /
 * `cron_delete` / `loop_wakeup` — the four tools the ported `loop` skill
 * drives — plus the autonomous-loop texts its ticks deliver. Delivery is the
 * harness's own follow-up seam: a firing job enqueues the prompt as a
 * follow-up turn on the agent that scheduled it (`agent.followup`), the same
 * "wake an idle driver with a queued ordinary turn" shape the official jobs
 * machinery uses. Jobs are session-only by construction: they live in this
 * process's memory and die with it, exactly like claude's non-durable
 * cron jobs and one-shot wakeups.
 *
 * Plain plugin, not a Service: it publishes nothing for other rows to inject,
 * and a Service would leak into the root realm, which the preset mount
 * refuses.
 *
 * @module claude-loop
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { nextFire, parseCron } from './cron.ts'

export const inject = ['tools']

/** Tool names the ported `loop` skill's `allowedTools` names. */
export const TOOL_NAMES = ['cron_create', 'cron_list', 'cron_delete', 'loop_wakeup'] as const

/** Session job cap (claude `MAX_JOBS`). */
const MAX_JOBS = 50
/** Self-paced wakeup bounds in seconds (claude `WAKEUP_MIN/MAX_SECONDS`). */
const WAKEUP_MIN_SECONDS = 60
const WAKEUP_MAX_SECONDS = 3600

interface CronJob {
  readonly id: string
  readonly expression: string
  readonly prompt: string
  readonly recurring: boolean
  nextAt: number
  timer: NodeJS.Timeout
}

interface Wakeup {
  readonly id: string
  readonly prompt: string
  timer: NodeJS.Timeout
}

/**
 * The session scheduler: timers → follow-up turns on the owning agent.
 * One pending wakeup per agent (a new LoopWakeup replaces it, mirroring
 * claude); cron jobs are independent.
 */
class SessionScheduler {
  private sequence = 0
  private readonly jobs = new Map<string, CronJob>()
  private readonly wakeups = new Map<Agent, Wakeup>()

  createCron(agent: Agent, expression: string, prompt: string, recurring: boolean): CronJob {
    const parsed = parseCron(expression)
    const firstAt = nextFire(parsed, Date.now())
    if (firstAt === null) throw new Error('cron 表达式在未来一年内没有触发时刻。')
    if (this.jobs.size + this.wakeups.size >= MAX_JOBS) {
      throw new Error(`本会话定时任务已达上限（${MAX_JOBS}），请先用 cron_delete 清理。`)
    }
    const id = `cron-${++this.sequence}`
    const job: CronJob = {
      id, expression, prompt, recurring, nextAt: firstAt,
      timer: this.arm(agent, firstAt, () => this.fireCron(agent, parsed, job)),
    }
    this.jobs.set(id, job)
    return job
  }

  private fireCron(agent: Agent, parsed: ReturnType<typeof parseCron>, job: CronJob): void {
    this.jobs.delete(job.id)
    if (job.recurring) {
      const at = nextFire(parsed, Date.now())
      if (at !== null) {
        job.nextAt = at
        job.timer = this.arm(agent, at, () => this.fireCron(agent, parsed, job))
        this.jobs.set(job.id, job)
      }
    }
    // The recurring cron re-fires by itself: the tick text tells the model
    // not to re-arm via LoopWakeup (claude CRON_REARM).
    this.deliver(agent, job.prompt, job.recurring
      ? '\n\n（循环说明：这是周期性 cron 自动触发的任务，下一轮会自动到来，不要调用 loop_wakeup 续命。）'
      : '\n\n（循环说明：这是一次性定时任务，触发后自动结束。）')
  }

  /** Schedule one self-paced wakeup, replacing the agent's pending one. */
  scheduleWakeup(agent: Agent, delaySeconds: number, prompt: string): { id: string; scheduledFor: string; clampedSeconds: number; replacedId?: string } {
    if (this.jobs.size + this.wakeups.size >= MAX_JOBS) {
      throw new Error(`本会话定时任务已达上限（${MAX_JOBS}），请先用 cron_clear 清理。`)
    }
    const clamped = Math.min(WAKEUP_MAX_SECONDS, Math.max(WAKEUP_MIN_SECONDS, Math.round(delaySeconds)))
    const previous = this.wakeups.get(agent)
    if (previous !== undefined) {
      clearTimeout(previous.timer)
      this.wakeups.delete(agent)
    }
    const id = `wakeup-${++this.sequence}`
    const scheduledFor = new Date(Date.now() + clamped * 1000).toLocaleString('zh-CN', { hour12: false })
    const wakeup: Wakeup = {
      id, prompt,
      timer: this.arm(agent, Date.now() + clamped * 1000, () => {
        this.wakeups.delete(agent)
        this.deliver(agent, prompt)
      }),
    }
    this.wakeups.set(agent, wakeup)
    return { id, scheduledFor, clampedSeconds: clamped, ...(previous === undefined ? {} : { replacedId: previous.id }) }
  }

  listCrons(): { id: string; expression: string; prompt: string; nextAt: string }[] {
    return [...this.jobs.values()].map(job => ({
      id: job.id, expression: job.expression, prompt: job.prompt,
      nextAt: new Date(job.nextAt).toLocaleString('zh-CN', { hour12: false }),
    }))
  }

  listWakeups(): { id: string; prompt: string }[] {
    return [...this.wakeups.values()].map(wakeup => ({ id: wakeup.id, prompt: wakeup.prompt }))
  }

  deleteJob(agent: Agent, id: string): boolean {
    const job = this.jobs.get(id)
    if (job !== undefined) {
      clearTimeout(job.timer)
      this.jobs.delete(id)
      return true
    }
    const wakeup = this.wakeups.get(agent)
    if (wakeup?.id === id) {
      clearTimeout(wakeup.timer)
      this.wakeups.delete(agent)
      return true
    }
    // A wakeup may be cleared by id from a different context (list output);
    // sweep by id then.
    for (const [owner, candidate] of this.wakeups) {
      if (candidate.id === id) {
        clearTimeout(candidate.timer)
        this.wakeups.delete(owner)
        return true
      }
    }
    return false
  }

  clearAll(): number {
    const count = this.jobs.size + this.wakeups.size
    for (const job of this.jobs.values()) clearTimeout(job.timer)
    for (const wakeup of this.wakeups.values()) clearTimeout(wakeup.timer)
    this.jobs.clear()
    this.wakeups.clear()
    return count
  }

  dispose(): void {
    this.clearAll()
  }

  private arm(_agent: Agent, at: number, fire: () => void): NodeJS.Timeout {
    return setTimeout(fire, Math.max(0, at - Date.now()))
  }

  /** Deliver one scheduled prompt as the owning agent's next ordinary turn. */
  private deliver(agent: Agent, prompt: string, suffix = ''): void {
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: `${prompt}${suffix}` }],
        source: { kind: 'user' },
      }))
    } catch (error) {
      // The owning agent may be disposed (session closed) between arming and
      // firing; a dropped tick is the correct outcome there.
      console.info('[claude-loop] scheduled delivery dropped', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/** Autonomous-loop texts, ported from claude `autonomous-loop.ts`. */
export const AUTONOMOUS_SENTINEL_CRON = '<<autonomous-loop>>'
export const AUTONOMOUS_SENTINEL_DYNAMIC = '<<autonomous-loop-dynamic>>'
export const CRON_REARM =
  'The recurring cron fires the next tick automatically — do not call LoopWakeup from this tick.'
export const keepAliveRearm = (sentinel: string, reason = 'To keep the loop alive'): string =>
  `You scheduled this tick via LoopWakeup (not a recurring cron). ${reason}, call LoopWakeup again at the end of this turn with prompt set to the literal sentinel \`${sentinel}\` — otherwise the loop ends after this tick.`

/**
 * Register the four scheduling tools. The ported `loop` skill's
 * `allowedTools` names these exactly.
 * @param ctx - preset scope. @param _config - unused.
 */
export default function apply(ctx: Context, _config: Record<string, never>): void {
  const scheduler = new SessionScheduler()

  const output = {
    schema: { type: 'json' } as const,
    render: (_args: unknown, value: unknown): { type: 'text'; text: string }[] =>
      [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }

  const cronCreate = defineTool({
    name: 'cron_create',
    description:
      'Schedule a prompt to be enqueued at a future time. Use for both recurring schedules (5-field cron) and one-shot reminders (recurring: false). Session-only: jobs live for this session and fire as a follow-up turn on the current conversation while it is open. Do not schedule anything irreversible without explicit user authorization.',
    parameters: {
      cron: { type: 'string', required: true, description: '5-field cron expression (minute hour day month weekday), e.g. "*/5 * * * *" or "30 9 * * 1-5".' },
      prompt: { type: 'string', required: true, description: 'The prompt to deliver at fire time. Self-contained: it runs as a fresh user turn.' },
      recurring: { type: 'boolean', description: 'Keep firing on the schedule (default true). false makes it a one-shot reminder.' },
    },
    output,
    async execute(args, exec) {
      if (exec.agent === undefined) return { ok: false, note: '当前没有可投递的会话（agent 缺失）。' }
      const { cron, prompt } = args as { cron: string; prompt: string; recurring?: boolean }
      const recurring = (args as { recurring?: boolean }).recurring ?? true
      const job = scheduler.createCron(exec.agent, cron, prompt.trim(), recurring)
      return {
        ok: true,
        id: job.id,
        recurring,
        nextFireAt: new Date(job.nextAt).toLocaleString('zh-CN', { hour12: false }),
        note: recurring ? '会话内周期任务：每轮自动触发，无需 loop_wakeup 续命。' : '一次性提醒：触发后自动删除。',
      }
    },
  })

  const cronList = defineTool({
    name: 'cron_list',
    description: 'List every scheduled cron job and pending loop wakeup in this session.',
    parameters: {},
    output,
    execute() {
      return Promise.resolve({
        ok: true,
        crons: scheduler.listCrons(),
        wakeups: scheduler.listWakeups(),
      })
    },
  })

  const cronDelete = defineTool({
    name: 'cron_delete',
    description: 'Delete one scheduled job by id (as returned by cron_create, loop_wakeup or cron_list), clearing the pending loop wakeup too.',
    parameters: {
      id: { type: 'string', required: true, description: 'Job id returned by cron_create or loop_wakeup.' },
    },
    output,
    execute(args, exec) {
      if (exec.agent === undefined) return Promise.resolve({ ok: false, note: '当前没有可投递的会话（agent 缺失）。' })
      const { id } = args as { id: string }
      const removed = scheduler.deleteJob(exec.agent, id.trim())
      return Promise.resolve({ ok: removed, id, ...(removed ? {} : { note: '没有找到该 id 的定时任务。' }) })
    },
  })

  const loopWakeup = defineTool({
    name: 'loop_wakeup',
    description:
      'Schedule a self-paced follow-up: after the delay, the prompt is enqueued as the next turn on this conversation. One pending wakeup per session — scheduling again replaces it. Session-only one-shot; call LoopWakeup again before ending the turn to keep a loop alive, omit it to end the loop. Bounds: 60-3600 seconds (clamped).',
    parameters: {
      delaySeconds: { type: 'number', required: true, description: 'Delay before the wakeup fires, 60-3600 s (values outside are clamped).' },
      prompt: { type: 'string', required: true, description: 'The prompt delivered on wakeup. For self-paced loops, pass the literal sentinel "<<autonomous-loop-dynamic>>" when re-arming an autonomous loop.' },
      reason: { type: 'string', description: 'Short human-readable reason recorded in the result.' },
    },
    output,
    execute(args, exec) {
      if (exec.agent === undefined) return Promise.resolve({ ok: false, note: '当前没有可投递的会话（agent 缺失）。' })
      const { delaySeconds, prompt, reason } = args as { delaySeconds: number; prompt: string; reason?: string }
      const trimmed = prompt.trim()
      if (trimmed === '') return Promise.resolve({ ok: false, note: 'loop_wakeup 的 prompt 不能为空。' })
      const scheduled = scheduler.scheduleWakeup(exec.agent, delaySeconds, trimmed)
      return Promise.resolve({
        ok: true,
        id: scheduled.id,
        scheduledFor: scheduled.scheduledFor,
        clampedSeconds: scheduled.clampedSeconds,
        ...(scheduled.clampedSeconds !== delaySeconds
          ? { note: `请求的 ${delaySeconds}s 被钳制到 ${scheduled.clampedSeconds}s（允许范围 ${WAKEUP_MIN_SECONDS}-${WAKEUP_MAX_SECONDS}s）。` }
          : {}),
        ...(scheduled.replacedId === undefined ? {} : { replacedId: scheduled.replacedId }),
        ...(reason === undefined ? {} : { reason }),
      })
    },
  })

  const disposers = [
    ctx.tools.register(cronCreate),
    ctx.tools.register(cronList),
    ctx.tools.register(cronDelete),
    ctx.tools.register(loopWakeup),
  ]
  ctx.effect(() => () => {
    scheduler.dispose()
    for (const dispose of disposers) dispose()
  }, 'claude-loop: scheduling tools')
}
