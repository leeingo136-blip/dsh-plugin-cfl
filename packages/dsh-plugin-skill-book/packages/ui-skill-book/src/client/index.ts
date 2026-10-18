/**
 * Skill Book settings client: registers the 技能 settings section (skill
 * manager). The `skill-book` remote namespace is mounted by the sibling
 * `skill-mount` client plugin; injecting `remote.skill-book` parks this
 * plugin's activation on the namespace service, mirroring the account column
 * (`remote.accountHub`).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { zh, en, type SkillBookKey } from './locales.ts'
import { SkillsSection, type SkillsFace } from './SkillsSection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.skill-book': SkillBookKey
  }
}

const NS = 'settings.skill-book'

export const inject = ['slots', 'locale', 'remote', 'remote.skill-book', 'theme']

/* eslint-disable @typescript-eslint/no-explicit-any */
type RemoteCall = (...args: any[]) => Promise<any>

/** Unwrap the remote envelope; failures surface as rejections with the message. */
async function unwrap<T>(promise: Promise<{ ok: true; value: T } | { ok: false; error: { message: string } }>): Promise<T> {
  const result = await promise
  if (result.ok) return result.value
  throw new Error(result.error.message)
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-skill-book: copy dictionaries')

  const skillBook = (ctx.remote as unknown as Record<string, Record<string, RemoteCall>>)['skill-book']!

  const t = ctx.locale.bind(NS) as (key: keyof SkillBookKey) => string

  const skillsFace: SkillsFace = {
    t,
    listSkills: () => unwrap(skillBook.skillList()),
    listSources: () => unwrap(skillBook.skillSources()),
    readSkill: (name, sourceId) => unwrap(skillBook.skillRead({ name, sourceId })),
    saveSkill: request => unwrap(skillBook.skillSave(request as unknown as Record<string, unknown>)),
    deleteSkill: async (name, sourceId) => { await unwrap(skillBook.skillDelete({ name, sourceId })) },
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skill-book',
    order: 25,
    label: () => t('navSkills'),
    inject: () => ({ face: skillsFace }),
  }, SkillsSection))
}
