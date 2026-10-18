/**
 * Library settings client: registers the 图书馆 settings section (local
 * vector knowledge bases). The `library` remote namespace is mounted by the
 * sibling `library-mount` client plugin; injecting `remote.library` parks
 * this plugin's activation on the namespace service, mirroring the account
 * column (`remote.accountHub`).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { zh, en, type LibraryKey } from './locales.ts'
import { KnowledgeSection, type RagFace } from './KnowledgeSection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.library': LibraryKey
  }
}

const NS = 'settings.library'

export const inject = ['slots', 'locale', 'remote', 'remote.library', 'theme']

/* eslint-disable @typescript-eslint/no-explicit-any */
type RemoteCall = (...args: any[]) => Promise<any>

/** Unwrap the remote envelope; failures surface as rejections with the message. */
async function unwrap<T>(promise: Promise<{ ok: true; value: T } | { ok: false; error: { message: string } }>): Promise<T> {
  const result = await promise
  if (result.ok) return result.value
  throw new Error(result.error.message)
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-library: copy dictionaries')

  const library = (ctx.remote as unknown as Record<string, Record<string, RemoteCall>>).library!

  const t = ctx.locale.bind(NS) as (key: keyof LibraryKey) => string

  const ragFace: RagFace = {
    t,
    list: () => unwrap(library.ragList()),
    create: (name, description) => unwrap(library.ragCreate({ name, description })),
    remove: async id => { await unwrap(library.ragDelete({ id })) },
    ingest: (id, texts) => unwrap(library.ragIngest({ id, texts: [...texts] })),
    query: (id, text, k) => unwrap(library.ragQuery({ id, text, k })),
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'library',
    order: 26,
    label: () => t('navLibrary'),
    inject: () => ({ face: ragFace }),
  }, KnowledgeSection))
}
