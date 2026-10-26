/**
 * Memory-recall settings client: registers the 记忆回想 settings section
 * (RAG connection cards). The `memory-echo` remote namespace is mounted by
 * the sibling `memory-mount` client plugin; injecting `remote.memory-echo`
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
    'settings.memory-echo': MemoryKey
  }
}

const NS = 'settings.memory-echo'

export const inject = ['slots', 'locale', 'remote', 'remote.memory-echo', 'theme']

/* eslint-disable @typescript-eslint/no-explicit-any */
type RemoteCall = (...args: any[]) => Promise<any>

/** Unwrap the remote envelope; failures surface as rejections with the message. */
async function unwrap<T>(promise: Promise<{ ok: true; value: T } | { ok: false; error: { message: string } }>): Promise<T> {
  const result = await promise
  if (result.ok) return result.value
  throw new Error(result.error.message)
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-memory-echo: copy dictionaries')

  // `remote.memory-echo` is declared in `inject`, so reading it here is legal;
  // the mount publishes the namespace before this plugin activates.
  const memory = (ctx.remote as unknown as Record<string, Record<string, RemoteCall>>)['memory-echo']!

  const t = ctx.locale.bind(NS) as (key: keyof MemoryKey) => string

  const face: MemoryFace = {
    t,
    list: () => unwrap(memory.connList()),
    create: input => unwrap(memory.connCreate(input)),
    update: input => unwrap(memory.connUpdate(input)),
    remove: async id => { await unwrap(memory.connDelete({ id })) },
    embeddingModels: () => unwrap(memory.embeddingModels()),
    query: input => unwrap(memory.connQuery(input)),
    generatePresets: () => unwrap(memory.generatePresets()),
    workspaceOptions: () => unwrap(memory.workspaceOptions()),
    presetOptions: () => unwrap(memory.presetOptions()),
    createCharacterPreset: input => unwrap(memory.createCharacterPreset(input)),
    openDatabaseLocation: input => unwrap(memory.openDatabaseLocation(input)),
    cardState: input => unwrap(memory.cardState(input)),
    dreamList: input => unwrap(memory.dreamList(input)),
    cardDisposition: input => unwrap(memory.cardDisposition(input)),
    setCardDisposition: input => unwrap(memory.setCardDisposition(input)),
    emotionChangeLog: input => unwrap(memory.emotionChangeLog(input)),
    setSelfState: input => unwrap(memory.setSelfState(input)),
    listEntities: input => unwrap(memory.listEntities(input)),
    saveEntity: input => unwrap(memory.saveEntity(input)),
    deleteEntity: input => unwrap(memory.deleteEntity(input)),
    listMemories: input => unwrap(memory.listMemories(input)),
    addMemory: input => unwrap(memory.addMemory(input)),
    deleteMemory: input => unwrap(memory.deleteMemory(input)),
    setEntityState: input => unwrap(memory.setEntityState(input)),
    databaseFiles: () => unwrap(memory.databaseFiles()),
    loadDatabase: input => unwrap(memory.loadDatabase(input)),
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'memory-echo',
    order: 26,
    label: () => t('navMemoryRecall'),
    locale: NS,
    inject: () => ({ face }),
  }, MemorySection))
}
