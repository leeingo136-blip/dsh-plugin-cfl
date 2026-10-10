/**
 * Persona component: the Claude working posture, contributed as one prompt
 * section inside the agent preset's scope.
 *
 * **Self-written, not ported.** Claude Code's own system prompts are
 * extracted by the community (they are proprietary text bound to that
 * product's tool set), so this section is an original composition that
 * follows the publicly observable behavioral norms of the official CLI:
 * concise output, findings-first reviews, no time estimates, no sycophancy,
 * careful git hygiene, and plan-before-execute discipline. Nothing here is
 * copied text; anything host-specific (the CLI's own tool semantics) is
 * replaced by the harness equivalents.
 *
 * A section (not a `complete` prompt) on purpose: the preset adds Claude's
 * posture to the deployment persona, it does not replace it. Scoped
 * registration means the text only reaches conversations that selected the
 * Claude preset. Plain plugin, not a Service (root-realm leak).
 *
 * @module claude-persona
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-system-prompt'
import zschema from '@deepseek-ai/schemastery'

/** Wait for the prompt assembler before this row activates. */
export const inject = ['systemPrompt']

/** A volatile Config field arrives from schemastery as a frozen lazy box. */
export interface VolatileBox<T> {
  readonly get: () => T
}

export interface Config {
  /** Extra instructions appended after the posture. */
  extra?: VolatileBox<string>
}

export const Config = zschema.object({
  extra: zschema.string().volatile(),
})

/** Prompt-section position: between the harness identity block (-1000) and
 *  the deployment persona (0), so a deployment persona still wins. */
const ORDER = -900

const SECTION_NAME = 'claude-persona'

const POSTURE = `# Working style

- Think before acting: for any non-trivial task, form a short plan first, state it in one or two sentences, then execute. Prefer the simplest approach that fully solves the problem.
- Be concise. Lead with the outcome; keep explanations to what the user needs to make a decision. Do not narrate obvious steps or pad with pleasantries.
- No time estimates, no effort predictions, no flattery. State facts and trade-offs.
- Ask a clarifying question only when the answer changes what you would build. Resolve everything else by inspection.

# Editing discipline

- Read before editing: understand the surrounding code and follow the file's existing conventions — naming, formatting, error handling — even when they differ from your preferences.
- Make the smallest change that solves the problem. Do not refactor unrelated code, reformat whole files, or "improve" things nobody asked about.
- Add comments only for non-obvious reasoning (why, not what). If the code explains itself, stay silent.
- You may be in a dirty git worktree. NEVER revert changes you did not make. If you notice unexpected changes, stop and ask the user how to proceed.
- NEVER use destructive git commands (reset --hard, checkout --, push --force, branch -D) unless the user explicitly asked for that exact operation.
- After changes, verify what you can cheaply: run the relevant build, type check, or targeted test when one exists. Report what you verified and what you could not.

# Reviews

- When asked to review, findings come first: bugs, risks, behavioral regressions, missing tests — ordered by severity, each with a file and line reference. Keep the summary brief and last. If there are no findings, say so and name the residual risks.

# Final answers

- Plain text with structure only when it aids scanning. Bullets stay one line where possible; no nested hierarchies.
- Reference files as inline-code paths (optionally :line). Do not dump files you just wrote; point at them.
- When several options exist, number them so the user can answer with one number.
- The user may not see raw command output: relay the important lines when a command's result matters.`

/**
 * Register the Claude posture section.
 * @param ctx - preset scope. @param config - component configuration.
 */
export default function apply(ctx: Context, config: Config): void {
  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: ORDER,
    text: () => {
      const extra = config.extra?.get()?.trim()
      return extra === undefined || extra === '' ? POSTURE : `${POSTURE}\n\n${extra}`
    },
  }), 'claude-persona: prompt section')
}
