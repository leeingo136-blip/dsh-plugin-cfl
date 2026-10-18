/**
 * Memory-recall settings client: registers the 记忆回想 settings section
 * (RAG connection cards). The `memory-recall` remote namespace is mounted by
 * the sibling `memory-mount` client plugin; injecting `remote.memory-recall`
 * parks this plugin's activation on the namespace service, mirroring the
 * account column (`remote.accountHub`).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { zh, en, type MemoryKey } from './locales.ts'
import { MemorySection, type MemoryFace } from './MemorySection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.memory-recall': MemoryKey
  }
}

const NS = 'settings.memory-recall'

export const inject = ['slots', 'locale', 'remote', 'remote.memory-recall', 'theme']

/* eslint-disable @typescript-eslint/no-explicit-any */
type RemoteCall = (...args: any[]) => Promise<any>

/** Unwrap the remote envelope; failures surface as rejections with the message. */
async function unwrap<T>(promise: Promise<{ ok: true; value: T } | { ok: false; error: { message: string } }>): Promise<T> {
  const result = await promise
  if (result.ok) return result.value
  throw new Error(result.error.message)
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-memory-recall: copy dictionaries')

  const memory = (ctx.remote as unknown as Record<string, Record<string, RemoteCall>>)['memory-recall']!

  const t = ctx.locale.bind(NS) as (key: keyof MemoryKey) => string

  const face: MemoryFace = {
    t,
    list: () => unwrap(memory.connList()),
    create: input => unwrap(memory.connCreate(input)),
    update: input => unwrap(memory.connUpdate(input)),
    remove: async id => { await unwrap(memory.connDelete({ id })) },
    embeddingModels: () => unwrap(memory.embeddingModels()),
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'memory-recall',
    order: 26,
    label: () => t('navMemoryRecall'),
    inject: () => ({ face }),
  }, MemorySection))
}
