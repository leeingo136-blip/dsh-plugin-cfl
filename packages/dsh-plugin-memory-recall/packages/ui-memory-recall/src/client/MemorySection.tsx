/**
 * 设置-记忆回想：RAG 数据库连接卡片。
 * 每张卡片显示一个连接（名称/类型/地址/embedding 引擎）；新建与编辑共用
 * 一个编辑器——新建时渲染在列表顶部，编辑时原位替换该卡片。名称唯一，
 * 作为工具参数明确连接哪个数据库；删除在编辑器末行左侧，保存/取消居右。
 */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MemoryKey } from './locales.ts'

/** One saved RAG connection card (wire shape of the memory-recall namespace). */
export interface ConnectionCard {
  id: string
  name: string
  description: string
  kind: 'local' | 'service'
  address: string
  embeddingModel: string
  createdAt: string
  updatedAt: string
}

export interface EmbeddingModelInfo {
  id: string
  file: string
  loaded: boolean
}

export interface MemoryFace {
  t(key: keyof MemoryKey): string
  list(): Promise<{ connections: ConnectionCard[]; defaults?: { localDir?: string } }>
  create(input: { name: string; description: string; kind: string; address: string; embeddingModel: string }): Promise<ConnectionCard>
  update(input: { id: string; name?: string; description?: string; kind?: string; address?: string; embeddingModel?: string }): Promise<ConnectionCard>
  remove(id: string): Promise<void>
  embeddingModels(): Promise<{ models: EmbeddingModelInfo[]; available: boolean }>
}

/** Editor draft state. */
interface Draft {
  name: string
  description: string
  kind: 'local' | 'service'
  address: string
  embeddingModel: string
}

const draftOf = (card?: ConnectionCard): Draft => ({
  name: card?.name ?? '',
  description: card?.description ?? '',
  kind: card?.kind ?? 'local',
  address: card?.address ?? '',
  embeddingModel: card?.embeddingModel ?? '',
})

export function MemorySection(props: { face?: MemoryFace }): ReactNode {
  const { face } = props
  if (face === undefined) return null
  return <MemoryLoaded face={face} />
}

function MemoryLoaded({ face }: { face: MemoryFace }): ReactNode {
  const [cards, setCards] = useState<readonly ConnectionCard[]>([])
  const [failed, setFailed] = useState<string | null>(null)
  /** Plugin-internal default directory for local database files (from connList). */
  const [localDir, setLocalDir] = useState<string | undefined>(undefined)
  /** The card being edited (id), or 'new' for the creation editor, or undefined. */
  const [editing, setEditing] = useState<string | 'new' | undefined>(undefined)

  const refresh = (): void => {
    void face.list().then(
      value => {
        setCards(value.connections)
        setLocalDir(value.defaults?.localDir)
        setFailed(null)
      },
      (error: unknown) => setFailed(error instanceof Error ? error.message : String(error)),
    )
  }
  useEffect(refresh, [face])

  return (
    <div>
      <div style={styles.toolbar}>
        <Button
          variant='primary'
          size='sm'
          disabled={editing === 'new'}
          onClick={() => { setEditing('new') }}
        >
          {face.t('createCard')}
        </Button>
        {failed !== null && <span style={styles.error}>{face.t('loadFailed')}{' — '}{failed}</span>}
      </div>

      {cards.length === 0 && editing === undefined && (
        <p>
          {face.t('empty')}
          <span style={styles.hint}>{' — '}{face.t('emptyHint')}</span>
        </p>
      )}

      <div style={styles.grid}>
        {editing === 'new' && (
          <CardEditor
            key='new'
            face={face}
            cards={cards}
            draft={draftOf()}
            localDir={localDir}
            onDone={() => { setEditing(undefined); refresh() }}
            onCancel={() => { setEditing(undefined) }}
          />
        )}
        {cards.map(card => (
          editing === card.id
            ? (
                <CardEditor
                  key={card.id}
                  face={face}
                  cards={cards}
                  draft={draftOf(card)}
                  localDir={localDir}
                  cardId={card.id}
                  onDone={() => { setEditing(undefined); refresh() }}
                  onCancel={() => { setEditing(undefined) }}
                  onDelete={() => {
                    if (!window.confirm(face.t('deleteConfirm'))) return
                    void face.remove(card.id).then(() => { setEditing(undefined); refresh() })
                  }}
                />
              )
            : <CardView key={card.id} face={face} card={card} onEdit={() => { setEditing(card.id) }} />
        ))}
      </div>
    </div>
  )
}

function CardView(props: { face: MemoryFace; card: ConnectionCard; onEdit(): void }): ReactNode {
  const { face, card, onEdit } = props
  return (
    <div style={styles.card}>
      <div style={styles.cardHead}>
        <strong style={styles.cardName}>{card.name}</strong>
        <span style={styles.badge}>{card.kind === 'local' ? face.t('kindLocal') : face.t('kindService')}</span>
        <span style={{ flex: 1 }} />
        <Button variant='outline' size='sm' onClick={onEdit}>{face.t('editCard')}</Button>
      </div>
      {card.description !== '' && <p style={styles.cardDescription}>{card.description}</p>}
      <div style={styles.metaRows}>
        <span style={styles.metaRow}>
          <span style={styles.metaLabel}>{face.t('fieldAddress')}</span>
          <span style={styles.metaValue}>{card.address}</span>
        </span>
        <span style={styles.metaRow}>
          <span style={styles.metaLabel}>{face.t('fieldEmbedding')}</span>
          <span style={styles.metaValue}>{card.embeddingModel}</span>
        </span>
      </div>
    </div>
  )
}

function CardEditor(props: {
  face: MemoryFace
  cards: readonly ConnectionCard[]
  draft: Draft
  localDir?: string
  cardId?: string
  onDone(): void
  onCancel(): void
  onDelete?(): void
}): ReactNode {
  const { face, cards, cardId, localDir, onDone, onCancel, onDelete } = props
  const [draft, setDraft] = useState<Draft>(props.draft)
  /**
   * While untouched, the local address keeps deriving itself from the
   * plugin-internal directory and the card name; the first manual edit
   * hands control to the user for good.
   */
  const [addressTouched, setAddressTouched] = useState(props.draft.address !== '')
  const [models, setModels] = useState<readonly EmbeddingModelInfo[]>([])
  const [embeddingAvailable, setEmbeddingAvailable] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void face.embeddingModels().then(value => {
      setModels(value.models)
      setEmbeddingAvailable(value.available)
    }, () => { setEmbeddingAvailable(false) })
  }, [face])

  useEffect(() => {
    if (addressTouched || localDir === undefined) return
    if (draft.kind === 'local') {
      const base = draft.name.trim() === '' ? 'database' : draft.name.trim()
      const want = `${localDir.replace(/\/+$/, '')}/${base}.sqlite`
      if (draft.address !== want) setDraft(current => ({ ...current, address: want }))
    } else if (draft.address !== '') {
      setDraft(current => ({ ...current, address: '' }))
    }
  }, [addressTouched, localDir, draft.kind, draft.name, draft.address])

  const nameTaken = cards.some(one => one.name === draft.name.trim() && one.id !== cardId)
  const complete = draft.name.trim() !== '' && draft.address.trim() !== '' && draft.embeddingModel !== ''

  const submit = (): void => {
    if (nameTaken) { setError(face.t('nameDuplicate')); return }
    setBusy(true)
    const body = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      kind: draft.kind,
      address: draft.address.trim(),
      embeddingModel: draft.embeddingModel,
    }
    const call = cardId === undefined ? face.create(body) : face.update({ id: cardId, ...body })
    void call.then(() => {
      setBusy(false)
      onDone()
    }, (cause: unknown) => {
      setBusy(false)
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message.includes('name-duplicate') ? face.t('nameDuplicate')
        : message.includes('invalid-input') ? face.t('invalidInput')
        : message.includes('not-found') ? face.t('notFound')
        : message)
    })
  }

  return (
    <div style={{ ...styles.card, ...styles.editor }}>
      <strong style={styles.cardName}>{cardId === undefined ? face.t('newCardTitle') : face.t('editCard')}</strong>

      <label style={styles.field}>
        <span style={styles.fieldLabel}>{face.t('fieldName')}</span>
        <input
          style={styles.input}
          value={draft.name}
          placeholder={face.t('fieldNameHint')}
          onChange={event => { setDraft({ ...draft, name: event.target.value }) }}
        />
        {nameTaken && <span style={styles.error}>{face.t('nameDuplicate')}</span>}
      </label>

      <label style={styles.field}>
        <span style={styles.fieldLabel}>{face.t('fieldDescription')}</span>
        <input
          style={styles.input}
          value={draft.description}
          onChange={event => { setDraft({ ...draft, description: event.target.value }) }}
        />
      </label>

      <label style={styles.field}>
        <span style={styles.fieldLabel}>{face.t('fieldKind')}</span>
        <select
          style={styles.input}
          value={draft.kind}
          onChange={event => { setDraft({ ...draft, kind: event.target.value as Draft['kind'] }) }}
        >
          <option value='local'>{face.t('kindLocal')}</option>
          <option value='service'>{face.t('kindService')}</option>
        </select>
      </label>

      <label style={styles.field}>
        <span style={styles.fieldLabel}>{face.t('fieldAddress')}</span>
        <input
          style={styles.input}
          value={draft.address}
          placeholder={draft.kind === 'local' ? face.t('addressPlaceholderLocal') : face.t('addressPlaceholderService')}
          onChange={event => { setAddressTouched(true); setDraft({ ...draft, address: event.target.value }) }}
        />
        {draft.kind === 'local' && <span style={styles.hint}>{face.t('addressHintLocal')}</span>}
      </label>

      <label style={styles.field}>
        <span style={styles.fieldLabel}>{face.t('fieldEmbedding')}</span>
        <select
          style={styles.input}
          value={draft.embeddingModel}
          onChange={event => { setDraft({ ...draft, embeddingModel: event.target.value }) }}
        >
          <option value=''>{face.t('embeddingPick')}</option>
          {models.map(model => (
            <option key={model.id} value={model.id}>{model.id}</option>
          ))}
        </select>
        {!embeddingAvailable && <span style={styles.hint}>{face.t('embeddingUnavailable')}</span>}
      </label>

      {error !== null && <span style={styles.error}>{error}</span>}

      <div style={styles.editorFooter}>
        {onDelete !== undefined && (
          <Button
            variant='outline'
            size='sm'
            style={styles.dangerButton}
            disabled={busy}
            onClick={onDelete}
          >
            {face.t('delete')}
          </Button>
        )}
        <span style={{ flex: 1 }} />
        <Button variant='primary' size='sm' disabled={!complete || busy} onClick={submit}>
          {face.t('save')}
        </Button>
        <Button variant='outline' size='sm' disabled={busy} onClick={onCancel}>
          {face.t('cancel')}
        </Button>
      </div>
    </div>
  )
}

const styles = {
  toolbar: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
  error: { color: '#c0392b', fontSize: 13 },
  hint: { opacity: 0.65, fontSize: 13 },
  grid: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  card: {
    border: '1px solid var(--dsh-border, #ddd)', borderRadius: 10,
    padding: '10px 14px', display: 'flex', flexDirection: 'column' as const, gap: 8,
  },
  editor: { gap: 12 },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 14 },
  cardDescription: { margin: 0, fontSize: 13, opacity: 0.8 },
  badge: {
    fontSize: 11, padding: '2px 8px', borderRadius: 999,
    background: 'var(--dsh-surface, rgba(127,127,127,0.12))', opacity: 0.85,
  },
  metaRows: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  metaRow: { display: 'flex', gap: 8, fontSize: 12 },
  metaLabel: { opacity: 0.6, minWidth: 96 },
  metaValue: { fontFamily: 'monospace', wordBreak: 'break-all' as const },
  field: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  fieldLabel: { fontSize: 13, opacity: 0.75 },
  input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)' },
  dangerButton: { color: 'var(--dsw-alias-state-error-primary, #c0392b)' },
  editorFooter: { display: 'flex', alignItems: 'center', gap: 8 },
}
