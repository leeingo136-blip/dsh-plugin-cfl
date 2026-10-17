/**
 * Knowledge Book settings client: registers the two settings sections —
 * 技能 (skill manager) and 知识库 (local vector knowledge bases). The
 * `knowledge` remote namespace is mounted by the sibling `knowledge-mount`
 * client plugin; injecting `remote.knowledge` parks this plugin's activation
 * on the namespace service, mirroring the account column (`remote.accountHub`).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { zh, en, type KnowledgeKey } from './locales.ts'
import { SkillsSection, type SkillsFace } from './SkillsSection.tsx'
import { KnowledgeSection, type RagFace } from './KnowledgeSection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.knowledge': KnowledgeKey
  }
}

const NS = 'settings.knowledge'

export const inject = ['slots', 'locale', 'remote', 'remote.knowledge', 'theme']

/* eslint-disable @typescript-eslint/no-explicit-any */
type RemoteCall = (...args: any[]) => Promise<any>

/** Unwrap the remote envelope; failures surface as rejections with the message. */
async function unwrap<T>(promise: Promise<{ ok: true; value: T } | { ok: false; error: { message: string } }>): Promise<T> {
  const result = await promise
  if (result.ok) return result.value
  throw new Error(result.error.message)
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-knowledge-book: copy dictionaries')

  const knowledge = (ctx.remote as unknown as Record<string, Record<string, RemoteCall>>).knowledge!

  const t = ctx.locale.bind(NS) as (key: keyof KnowledgeKey) => string

  const skillsFace: SkillsFace = {
    t,
    listSkills: () => unwrap(knowledge.skillList()),
    listSources: () => unwrap(knowledge.skillSources()),
    readSkill: (name, sourceId) => unwrap(knowledge.skillRead({ name, sourceId })),
    saveSkill: request => unwrap(knowledge.skillSave(request as unknown as Record<string, unknown>)),
    deleteSkill: async (name, sourceId) => { await unwrap(knowledge.skillDelete({ name, sourceId })) },
  }

  const ragFace: RagFace = {
    t,
    list: () => unwrap(knowledge.ragList()),
    create: (name, description) => unwrap(knowledge.ragCreate({ name, description })),
    remove: async id => { await unwrap(knowledge.ragDelete({ id })) },
    ingest: (id, texts) => unwrap(knowledge.ragIngest({ id, texts: [...texts] })),
    query: (id, text, k) => unwrap(knowledge.ragQuery({ id, text, k })),
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'knowledge-skills',
    order: 25,
    label: () => t('navSkills'),
    inject: () => ({ face: skillsFace }),
  }, SkillsSection))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'knowledge-rag',
    order: 26,
    label: () => t('navRag'),
    inject: () => ({ face: ragFace }),
  }, KnowledgeSection))
}
