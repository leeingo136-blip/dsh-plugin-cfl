/**
 * Harness metadata scrubber for remembered text.
 *
 * The runtime appends its own bookkeeping to the conversation: time samples,
 * runtime-context snapshots, file-policy and approval lines, skill catalogs in
 * `<system-reminder>` blocks, model-change notices. Those are instructions to
 * *this* turn, not something the user said. Left in, they pollute the memory
 * store (and dreams happily quote "Time sampled while preparing turn 14" back
 * as if it were a memory).
 *
 * The scrubber is deliberately conservative: it drops whole paragraphs that
 * START with a known metadata prefix, and removes `<system-reminder>` blocks
 * outright. Ordinary prose that merely mentions a timestamp survives.
 *
 * @module memory-echo-tools/text
 */

/** Paragraph-leading markers produced by the runtime, not by the user. */
const META_PREFIXES = [
  'Time sampled while preparing',
  'Browser time zone for this request',
  'Elapsed since the preceding',
  'Current runtime context',
  'Current working directory:',
  'Current DSH file policy:',
  'Approval policy:',
  'Current DeepSeek Harness implementation checkout:',
  'Current DeepSeek Harness Web GUI URL:',
  'Tokens prefixed with @',
  'Check the [exit code:',
  'Use the read tool',
  'Use the glob tool',
  'Use the grep tool',
  'You are interacting with the user through',
  'The runtime context names',
  'The browser provides',
  '[model changed:',
  '[user interrupted',
]

/** Drop `<system-reminder>…</system-reminder>` blocks, including multi-line ones. */
function dropReminders(text: string): string {
  return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, ' ')
}

/** Remove runtime bookkeeping while leaving the user's own words intact. */
export function stripHarnessMeta(text: string): string {
  const withoutReminders = dropReminders(text)
  const paragraphs = withoutReminders.split(/\n{2,}/)
  const kept: string[] = []
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim()
    if (trimmed === '') continue
    if (META_PREFIXES.some(prefix => trimmed.startsWith(prefix))) continue
    // A metadata block can also be appended inside one paragraph; drop the
    // individual lines that announce themselves while keeping everything else.
    const lines = trimmed.split('\n').filter(line => {
      const value = line.trim()
      return value !== '' && !META_PREFIXES.some(prefix => value.startsWith(prefix))
    })
    if (lines.length > 0) kept.push(lines.join('\n'))
  }
  return kept.join('\n\n').trim()
}
