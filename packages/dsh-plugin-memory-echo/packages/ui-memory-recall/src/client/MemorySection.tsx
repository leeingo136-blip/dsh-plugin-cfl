/**
 * 设置-记忆回想：RAG 数据库连接卡片。
 * 每张卡片显示一个连接（名称/类型/地址/embedding 引擎）；新建与编辑共用
 * 一个编辑器——新建时渲染在列表顶部，编辑时原位替换该卡片。名称唯一，
 * 作为工具参数明确连接哪个数据库；删除在编辑器末行左侧，保存/取消居右。
 */
import { useEffect, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './QueryModal.module.css'
import type { MemoryKey } from './locales.ts'

/** One saved RAG connection card (wire shape of the memory-echo namespace). */
export interface ConnectionCard {
  id: string
  plan: string
  persona: string
  injectGroups: number
  name: string
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
  create(input: { plan: string; name: string; persona: string; address: string; embeddingModel: string; basePreset: string; injectGroups: number }): Promise<ConnectionCard>
  update(input: { id: string; name?: string; plan?: string; persona?: string; address?: string; embeddingModel?: string; basePreset?: string; injectGroups?: number }): Promise<ConnectionCard>
  remove(id: string): Promise<void>
  embeddingModels(): Promise<{ models: EmbeddingModelInfo[]; available: boolean }>
  query(input: { id: string; query: string; topK?: number }): Promise<{ results: Array<QueryHitWire> }>
  generatePresets(): Promise<{ path: string; generated: number; skipped: number; conflicts: string[] }>
  presetOptions(): Promise<{ presets: Array<{ id: string; name: string }> }>
  createCharacterPreset(input: { plan: string; basePresetId: string }): Promise<{ plan: string; name: string }>
  openDatabaseLocation(input: { id: string }): Promise<{ path: string }>
  databaseFiles(): Promise<{ files: Array<{ address: string; name: string; plan: string; title: string }> }>
  loadDatabase(input: { address: string }): Promise<{ name: string; persona: string }>
  setSelfState(input: { id: string; key: string; value: number }): Promise<{ key: string; value: number }>
  listEntities(input: { id: string; query?: string }): Promise<{ rows: Array<Record<string, unknown>> }>
  saveEntity(input: { id: string; entity: Record<string, unknown> }): Promise<{ id: string }>
  deleteEntity(input: { id: string; entityId: string }): Promise<{ ok: boolean }>
  listMemories(input: { id: string; query?: string; limit?: number }): Promise<{ rows: Array<Record<string, unknown>> }>
  addMemory(input: { id: string; kind: string; content: string; salience: number }): Promise<{ id: string }>
  deleteMemory(input: { id: string; memoryId: string }): Promise<{ ok: boolean }>
  setEntityState(input: { id: string; entityId: string; key: string; value: number }): Promise<{ key: string; value: number }>
  dreamList(input: { id: string; limit?: number }): Promise<{ dreams: Array<{ rowid: number; content: string; addedAt: string; source: string }> }>
  cardDisposition(input: { id: string }): Promise<{ relevance: number; attachment: number; solidarity: number; status: number; trust: number; commitment: number; gains: Record<string, number>; losses: Record<string, number> }>
  emotionChangeLog(input: { id: string; limit?: number }): Promise<{ rows: Array<Record<string, unknown>> }>
  setCardDisposition(input: { id: string; patch: Record<string, unknown> }): Promise<{ relevance: number; attachment: number; solidarity: number; status: number; trust: number; commitment: number; gains: Record<string, number>; losses: Record<string, number> }>
  cardState(input: { id: string }): Promise<{ sleep: Array<{ session: string; wakeAt: string | null }>; selfTags: string[]; personTags: Array<{ id: string; name: string; tags: string[] }>; selfState: Array<{ key: string; value: number }>; parameters: Array<{ key: string; label: string; stage: number; stageCount: number; description: string; guidance: string }>; traits: Array<{ key: string; label: string; value: number; description: string; guidance: string }>; lingering: Array<{ label: string; intensity: number; expiresAt: string }>; persons: Array<{ id: string; name: string; aliases: string; description: string; attitudes: Array<{ key: string; value: number }> }>; objects: Array<{ id: string; name: string; category: string; description: string; attitudes: Array<{ key: string; value: number }> }> }>
}

/** One KNN hit (wire shape). */
export interface QueryHitWire {
  content: string
  distance: number
}

/** Editor draft state. */
interface Draft {
  plan: string
  name: string
  persona: string
  address: string
  embeddingModel: string
}

const draftOf = (card?: ConnectionCard): Draft => ({
  plan: card?.plan ?? '',
  name: card?.name ?? '',
  persona: card?.persona ?? '',
  address: card?.address ?? '',
  embeddingModel: card?.embeddingModel ?? '',
})

const ATTITUDE_LABELS: Record<string, string> = {
  attachment: '依恋',
  solidarity: '亲近',
  status: '地位',
  trust: '信任',
  commitment: '承诺',
}

const TRAIT_LABELS: Record<string, string> = {
  timidity: '胆怯',
  irritability: '易怒',
  confidence: '自信',
  sensitivity: '敏感',
}

const KIND_LABELS: Record<string, string> = { user: '用户', assistant: '助手', system: '系统', dream: '梦境' }

const STATE_HINTS: Record<string, string> = {
  valence: '愉悦度：-1 很不愉快，0 中性，1 很愉快',
  arousal: '激活度：-1 极度松弛/倦怠，0 平静，1 高度激动/紧绷',
  dominance: '掌控感：-1 完全被支配，0 平衡，1 完全掌控',
  stamina: '体力：0 耗尽，1 充沛',
  trust: '信任：-1 完全不信任，0 中立，1 完全信任',
}

const STATE_LABELS: Record<string, string> = {
  valence: '愉悦度',
  arousal: '激活度',
  dominance: '掌控感',
  stamina: '体力',
  trust: '信任',
}

export function MemorySection(props: { face?: MemoryFace }): ReactNode {
  const probe = props.face
  if (probe === undefined) {
    return <div style={{ padding: 16 }}>心灵回响：设置组件已加载，但未收到 face 注入（slot inject 未生效）。</div>
  }
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
  /** The card whose connect/search modal is open. */
  const [querying, setQuerying] = useState<ConnectionCard | undefined>(undefined)

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
        <strong style={{ marginRight: 8 }}>心灵回响 · 角色卡</strong>
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
                  onConnect={() => { setQuerying(card) }}
                  onDone={() => { setEditing(undefined); refresh() }}
                  onCancel={() => { setEditing(undefined) }}
                  onDelete={() => {
                    if (!window.confirm(face.t('deleteConfirm'))) return
                    void face.remove(card.id).then(() => { setEditing(undefined); refresh() })
                  }}
                />
              )
            : (
                <CardView
                  key={card.id}
                  face={face}
                  card={card}
                  onEdit={() => { setEditing(card.id) }}
                  onConnect={() => { setQuerying(card) }}
                />
              )
        ))}
      </div>

      {querying !== undefined && (
        <QueryModal
          face={face}
          card={querying}
          onClose={() => { setQuerying(undefined) }}
        />
      )}
    </div>
  )
}

function CardView(props: { face: MemoryFace; card: ConnectionCard; onEdit(): void }): ReactNode {
  const { face, card, onEdit } = props
  return (
    <div style={styles.card}>
      <div style={styles.cardHead}>
        <strong style={styles.cardName}>{card.plan}</strong>
        <span style={{ flex: 1 }} />
        <Button variant='outline' size='sm' onClick={onEdit}>{face.t('editCard')}</Button>
      </div>
      <div style={styles.metaRows}>
        <span style={styles.metaRow}>
          <span style={styles.metaLabel}>{face.t('fieldName')}</span>
          <span style={styles.metaValue}>{card.name}</span>
        </span>
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
  onConnect?(): void
}): ReactNode {
  const { face, cards, cardId, localDir, onDone, onCancel, onDelete, onConnect } = props
  const [draft, setDraft] = useState<Draft>(props.draft)
  const [presets, setPresets] = useState<Array<{ id: string; name: string }>>([])
  const [basePreset, setBasePreset] = useState('')
  const [panel, setPanel] = useState<'person' | 'object' | 'memory' | 'dream' | undefined>(undefined)
  const [dbPicker, setDbPicker] = useState<Array<{ address: string; name: string; plan: string; title: string }> | undefined>(undefined)
  const [selfOpen, setSelfOpen] = useState(false)
  const [coefficientOpen, setCoefficientOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [cardState, setCardState] = useState<{ sleep: Array<{ session: string; wakeAt: string | null }>; selfTags: string[]; personTags: Array<{ id: string; name: string; tags: string[] }>; selfState: Array<{ key: string; value: number }>; parameters: Array<{ key: string; label: string; stage: number; stageCount: number; description: string; guidance: string }>; traits: Array<{ key: string; label: string; value: number; description: string; guidance: string }>; lingering: Array<{ label: string; intensity: number; expiresAt: string }>; persons: Array<{ id: string; name: string; aliases: string; description: string; attitudes: Array<{ key: string; value: number }> }>; objects: Array<{ id: string; name: string; category: string; description: string; attitudes: Array<{ key: string; value: number }> }> }>({ sleep: [], selfTags: [], personTags: [], selfState: [], parameters: [], traits: [], lingering: [], persons: [], objects: [] })

  useEffect(() => {
    if (cardId === undefined) return
    void face.cardState({ id: cardId }).then(
      value => { setCardState({ ...value, parameters: value.parameters ?? [], traits: value.traits ?? [], lingering: value.lingering ?? [] }) },
      () => {},
    )
  }, [face, cardId])
  useEffect(() => {
    void face.presetOptions().then(value => {
      setPresets(value.presets)
      setBasePreset(current => current === '' ? (value.presets[0]?.id ?? '') : current)
    }, () => {})
  }, [face])
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
    if (addressTouched || localDir === undefined || draft.plan.trim() === '') return
    const want = `${localDir.replace(/\/+$/, '')}/${draft.plan.trim().toLowerCase()}.sqlite`
    if (draft.address !== want) setDraft(current => ({ ...current, address: want }))
  }, [addressTouched, localDir, draft.plan, draft.address])

  const nameTaken = cards.some(one => one.name === draft.name.trim() && one.id !== cardId)
  const complete = draft.plan.trim() !== '' && draft.name.trim() !== '' && draft.embeddingModel !== ''

  const submit = (): void => {
    if (nameTaken) { setError(face.t('nameDuplicate')); return }
    setBusy(true)
    const body = {
      plan: draft.plan.trim().toLowerCase(),
      name: draft.name.trim(),
      persona: draft.persona,
      address: draft.address.trim(),
      embeddingModel: draft.embeddingModel,
      basePreset,
      injectGroups: draft.injectGroups,
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

      <div style={styles.fieldRow}>
      <div style={styles.field}>
        <span style={styles.fieldHead}>
          <span style={styles.fieldLabel}>{face.t('fieldPlan')}</span>
        </span>
        <input
          style={styles.input}
          value={draft.plan}
          placeholder='work-assistant'
          onChange={event => { setDraft({ ...draft, plan: event.target.value }) }}
        />
      </div>
      <div style={styles.field}>
        <span style={styles.fieldHead}>
          <span style={styles.fieldLabel}>{face.t('fieldAddress')}</span>
          <span style={{ flex: 1 }} />
          <Button variant='outline' size='sm' disabled={busy} onClick={submit}>保存</Button>
          <Button variant='outline' size='sm' disabled={busy} onClick={() => {
            void face.databaseFiles().then(value => setDbPicker(value.files), (error: unknown) => window.alert(error instanceof Error ? error.message : String(error)))
          }}>载入</Button>
        </span>


        <input
          style={styles.input}
          value={draft.address}
          placeholder='保存时自动创建'
          onChange={event => { setAddressTouched(true); setDraft({ ...draft, address: event.target.value }) }}
        />
      </div>

      {dbPicker !== undefined && (
        <div style={styles.field}>
          <span style={styles.fieldLabel}>选择要载入的数据库</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {dbPicker.map(file => (
              <Button key={file.address} variant='outline' size='sm' disabled={busy} onClick={() => {
                void face.loadDatabase({ address: file.address }).then(value => {
                  const body = {
                    plan: file.plan,
                    name: value.name,
                    persona: value.persona,
                    address: file.address,
                    embeddingModel: draft.embeddingModel,
                    basePreset,
                    injectGroups: draft.injectGroups,
                  }
                  setDbPicker(undefined)
                  setBusy(true)
                  const call = cardId === undefined ? face.create(body) : face.update({ id: cardId, ...body })
                  void call.then(() => { setBusy(false); onDone() }, (error: unknown) => { setBusy(false); setError(error instanceof Error ? error.message : String(error)) })
                }, (error: unknown) => window.alert(error instanceof Error ? error.message : String(error)))
              }}>{file.title !== '' ? `${file.title}（${file.plan}）` : file.plan}</Button>
            ))}
            {dbPicker.length === 0 && <span style={styles.hint}>databases 目录下没有 .sqlite 文件</span>}
            <Button variant='outline' size='sm' onClick={() => setDbPicker(undefined)}>取消</Button>
          </div>
        </div>
      )}
      </div>

      <div style={styles.fieldRow}>
      <div style={styles.field}>
        <span style={styles.fieldLabel}>{face.t('fieldName')}</span>
        <input
          style={styles.input}
          value={draft.name}
          placeholder={face.t('fieldNameHint')}
          onChange={event => { setDraft({ ...draft, name: event.target.value }) }}
        />
        {nameTaken && <span style={styles.error}>{face.t('nameDuplicate')}</span>}
      </div>
      <div style={styles.field}>
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
      </div>
      </div>

      <div style={styles.field}>
        <span style={styles.fieldLabel}>{face.t('fieldPersona')}</span>
        <textarea
          style={{ ...styles.input, minHeight: 80 }}
          value={draft.persona}
          onChange={event => { setDraft({ ...draft, persona: event.target.value }) }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' as const }}>
        <Button variant='outline' size='sm' onClick={() => { setCoefficientOpen(true) }}>情绪系数</Button>
        <Button variant='outline' size='sm' onClick={() => { setSelfOpen(true) }}>己 情绪</Button>
        <Button variant='outline' size='sm' onClick={() => { setPanel('entity') }}>关系</Button>
        <Button variant='outline' size='sm' onClick={() => { setPanel('memory') }}>记忆记录</Button>
        <Button variant='outline' size='sm' onClick={() => { setPanel('dream') }}>梦境记录</Button>
        <Button variant='outline' size='sm' onClick={() => { setLogOpen(true) }}>变动记录</Button>
      </div>

      {selfOpen && cardId !== undefined && (
        <SelfModal face={face} cardId={cardId} state={cardState} onClose={() => { setSelfOpen(false) }} />
      )}

      {coefficientOpen && cardId !== undefined && (
        <CoefficientModal face={face} cardId={cardId} onClose={() => { setCoefficientOpen(false) }} />
      )}

      {logOpen && cardId !== undefined && (
        <ChangeLogModal face={face} cardId={cardId} onClose={() => { setLogOpen(false) }} />
      )}

      {panel !== undefined && cardId !== undefined && (
        <RelationsModal face={face} cardId={cardId} mode={panel} onClose={() => { setPanel(undefined) }} />
      )}







      {error !== null && <span style={styles.error}>{error}</span>}

      <div style={styles.field}>
        <span style={styles.fieldHead}>
          <span style={styles.fieldLabel}>基础预设</span>
          <span style={{ flex: 1 }} />
          <Button variant='outline' size='sm' onClick={() => {
            void face.presetOptions().then(value => setPresets(value.presets), (error: unknown) => window.alert(error instanceof Error ? error.message : String(error)))
          }}>刷新</Button>
        </span>
        <select style={styles.input} value={basePreset} onChange={event => setBasePreset(event.target.value)}>
          <option value=''>请选择基础预设</option>
          {presets.map(one => <option key={one.id} value={one.id}>{one.name}</option>)}
        </select>
        <span style={styles.hint}>列表来自当前 Harness 实际注册的预设；新预设需要选一个可用的基础预设。</span>
      </div>

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
        <Button
          variant='outline'
          size='sm'
          disabled={!complete || busy}
          disabled={!complete || basePreset === '' || busy}
          onClick={() => {
            setBusy(true)
            // 先保存当前卡片，再用它创建「预设 + 会话」。
            const body = {
              plan: draft.plan.trim().toLowerCase(),
              name: draft.name.trim(),
              persona: draft.persona,
                      address: draft.address.trim(),
              embeddingModel: draft.embeddingModel,
              basePreset,
              injectGroups: draft.injectGroups,
            }
            const save = cardId === undefined ? face.create(body) : face.update({ id: cardId, ...body })
            void save.then(() => face.createCharacterPreset({
              plan: draft.plan.trim().toLowerCase(),
              basePresetId: basePreset,
            })).then(result => {
              setBusy(false)
              window.alert(`已创建预设：${result.plan}\n新建会话选择该预设即可，"前世"会自动注入。`)
            }, (cause: unknown) => {
              setBusy(false)
              setError(cause instanceof Error ? cause.message : String(cause))
            })
          }}
        >
          创建预设
        </Button>
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

/**
 * Connect-and-search modal: type a query, KNN against the card's database
 * with its bound embedding engine. Enter searches; results list under the
 * input with distances.
 */
function QueryModal(props: { face: MemoryFace; card: ConnectionCard; onClose(): void }): ReactNode {
  const { face, card, onClose } = props
  const [text, setText] = useState('')
  const [results, setResults] = useState<readonly QueryHitWire[] | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = (): void => {
    const query = text.trim()
    if (query === '' || busy) return
    setBusy(true)
    setError(null)
    void face.query({ id: card.id, query }).then(value => {
      setBusy(false)
      setResults(value.results)
    }, (cause: unknown) => {
      setBusy(false)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${face.t('connectDb')} — ${card.name}`}
      closeLabel={face.t('cancel')}
      className={css.wide}
      contentClassName={css.body}
      footer={
        <>
          <Button variant='primary' size='sm' disabled={text.trim() === '' || busy} onClick={search}>
            {face.t('search')}
          </Button>
          <Button variant='outline' size='sm' disabled={busy} onClick={onClose}>
            {face.t('cancel')}
          </Button>
        </>
      }
    >
      <div style={styles.modalBody}>
        <div style={{ fontSize: 12, opacity: 0.7, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left' }} title={card.address}>{card.address}</div>
        <Input
          data-modal-autofocus
          style={styles.modalInput}
          value={text}
          placeholder={face.t('queryPlaceholder')}
          disabled={busy}
          onChange={event => { setText(event.target.value) }}
          onKeyDown={event => { if (event.key === 'Enter') search() }}
        />
        {busy && <span style={styles.hint}>{face.t('searching')}</span>}
        {error !== null && <span style={styles.error}>{error}</span>}
        {results !== undefined && !busy && error === null && results.length === 0 && (
          <span style={styles.hint}>{face.t('noResults')}</span>
        )}
        {results !== undefined && results.length > 0 && (
          <div style={styles.resultList}>
            {results.map((hit, index) => (
              <div key={index} style={styles.resultItem}>
                <span style={styles.resultDistance}>{hit.distance.toFixed(4)}</span>
                <span style={styles.resultContent}>{hit.content}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

const SELF_COEFFICIENTS = [
  { key: 'valence', label: '愉悦度' },
  { key: 'arousal', label: '激活度' },
  { key: 'dominance', label: '掌控感' },
  { key: 'trust', label: '信任' },
] as const

const RELATION_COEFFICIENTS = [
  { key: 'attachment', label: '依恋' },
  { key: 'solidarity', label: '亲近' },
  { key: 'status', label: '地位' },
  { key: 'relation.trust', label: '信任' },
  { key: 'commitment', label: '承诺' },
] as const

type DispositionWire = {
  relevance: number
  gains: Record<string, number>
  losses: Record<string, number>
}

function CoefficientModal(props: { face: MemoryFace; cardId: string; onClose(): void }): ReactNode {
  const [data, setData] = useState<DispositionWire | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  useEffect(() => {
    if (typeof props.face.cardDisposition !== 'function') {
      setFailure('当前宿主未提供情绪系数接口，请重启应用后再试。')
      return
    }
    try {
      void props.face.cardDisposition({ id: props.cardId }).then(
        value => {
          setData({
            relevance: Number(value?.relevance ?? 0.5),
            gains: value?.gains ?? {},
            losses: value?.losses ?? {},
          })
        },
        (error: unknown) => { setFailure(error instanceof Error ? error.message : String(error)) },
      )
    } catch (error: unknown) {
      setFailure(`读取情绪系数失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }, [props.cardId, props.face])

  const number = (key: string, kind: 'gains' | 'losses'): number => data?.[kind]?.[key] ?? 1
  const setNumber = (key: string, kind: 'gains' | 'losses', value: number): void => {
    setData(current => current === null ? current : { ...current, [kind]: { ...(current[kind] ?? {}), [key]: value } })
  }
  const save = (): void => {
    if (data === null) return
    if (typeof props.face.setCardDisposition !== 'function') {
      setFailure('当前宿主未提供保存接口，请重启应用后再试。')
      return
    }
    setBusy(true); setFailure('')
    try {
      void props.face.setCardDisposition({ id: props.cardId, patch: data }).then(
        () => { setBusy(false); props.onClose() },
        (error: unknown) => { setBusy(false); setFailure(error instanceof Error ? error.message : String(error)) },
      )
    } catch (error: unknown) {
      setBusy(false)
      setFailure(`保存失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const renderRow = (key: string, label: string): ReactNode => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ flex: '1 1 auto', fontSize: 13 }}>{label}</span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
        增加
        <input type='number' min={0.2} max={2} step={0.05} style={{ ...styles.input, width: 64, textAlign: 'center' as const }}
          value={number(key, 'gains')}
          onChange={event => { setNumber(key, 'gains', Number(event.target.value)) }} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
        减少
        <input type='number' min={0.2} max={2} step={0.05} style={{ ...styles.input, width: 64, textAlign: 'center' as const }}
          value={number(key, 'losses')}
          onChange={event => { setNumber(key, 'losses', Number(event.target.value)) }} />
      </label>
    </div>
  )

  return (
    <Modal open onClose={props.onClose} title='情绪系数' closeLabel='关闭' className={css.wide} contentClassName={css.body}>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12, padding: 16 }}>
        {data === null ? (
          <span style={styles.hint}>{failure === '' ? '加载中…' : failure}</span>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: '1 1 auto', fontSize: 13 }}>默认相关性</span>
              <input type='number' min={0} max={1} step={0.05} style={{ ...styles.input, width: 80, textAlign: 'center' as const }}
                value={data.relevance}
                onChange={event => { setData({ ...data, relevance: Number(event.target.value) }) }} />
            </div>
            <span style={styles.hint}>系数只放大幅度：1 为正常，&gt;1 更敏感，&lt;1 更迟钝；范围 0.2 ~ 2.0，不设硬上限。</span>
            <span style={styles.fieldLabel}>己</span>
            {SELF_COEFFICIENTS.map(one => renderRow(one.key, one.label))}
            <span style={styles.fieldLabel}>关系</span>
            {RELATION_COEFFICIENTS.map(one => renderRow(one.key, one.label))}
            {failure !== '' && <span style={styles.hint}>{failure}</span>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant='outline' size='sm' onClick={props.onClose} disabled={busy}>取消</Button>
              <Button variant='primary' size='sm' onClick={save} disabled={busy}>{busy ? '保存中…' : '保存'}</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function SelfModal(props: {
  face: MemoryFace
  cardId: string
  state: { selfTags: string[]; selfState: Array<{ key: string; value: number }>; parameters: Array<{ key: string; label: string; stage: number; stageCount: number; description: string; guidance: string }>; traits: Array<{ key: string; label: string; value: number; description: string; guidance: string }>; lingering: Array<{ label: string; intensity: number; expiresAt: string }>; sleep: Array<{ session: string; wakeAt: string | null }> }
  onClose(): void
}): ReactNode {
  const [values, setValues] = useState(props.state.selfState)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const ORDER = ['valence', 'arousal', 'dominance', 'stamina', 'trust']
  const ordered = [...values].sort((left, right) => ORDER.indexOf(left.key) - ORDER.indexOf(right.key))
  return (
    <Modal open onClose={props.onClose} title='己 · 状态' closeLabel='关闭' className={css.wide} contentClassName={css.body}>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12, padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {ordered.map(one => (
            <label key={one.key} style={{ display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
              <span style={{ ...styles.fieldLabel, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${STATE_HINTS[one.key] ?? ''}${(props.state.parameters ?? []).find(item => item.key === one.key)?.description ?? ''}`}>
                {STATE_LABELS[one.key] ?? one.key}
                {(props.state.parameters ?? []).find(item => item.key === one.key)?.label !== undefined && (
                  <span style={{ opacity: 0.65, marginLeft: 4 }}>· {(props.state.parameters ?? []).find(item => item.key === one.key)?.label}</span>
                )}
              </span>
              <input
                type='number'
                min={['valence', 'arousal', 'dominance', 'trust'].includes(one.key) ? -1 : 0}
                max={1}
                step={0.01}
                style={{ ...styles.input, width: '100%', maxWidth: 120, fontSize: 13, textAlign: 'center' as const }}
                value={one.value}
                onChange={event => {
                  const value = Number(event.target.value)
                  setValues(current => current.map(item => item.key === one.key ? { ...item, value } : item))
                }}
                onBlur={() => {
                  void props.face.setSelfState({ id: props.cardId, key: one.key, value: one.value }).catch(() => {})
                }}
              />
            </label>
          ))}
          {values.length === 0 && <span style={styles.hint}>（暂无状态数据）</span>}
        </div>
        {props.state.selfTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
            {props.state.selfTags.map(tag => <span key={tag} style={styles.badge}>{tag}</span>)}
          </div>
        )}
        {(props.state.traits ?? []).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
            <span style={styles.fieldLabel}>性格倾向</span>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
              {(props.state.traits ?? []).map(one => (
                <span key={one.key} style={styles.badge} title={one.description}>{TRAIT_LABELS[one.key] ?? one.key} · {one.label}</span>
              ))}
            </div>
          </div>
        )}
        {(props.state.lingering ?? []).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
            <span style={styles.fieldLabel}>残留情绪</span>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
              {(props.state.lingering ?? []).map(one => (
                <span key={one.label} style={styles.badge} title={`到期：${one.expiresAt.slice(0, 16).replace('T', ' ')}`}>
                  {one.label} · {Math.round(one.intensity * 100)}%
                </span>
              ))}
            </div>
          </div>
        )}
        {props.state.sleep.length > 0 && (
          <span style={styles.hint}>
            {props.state.sleep.map(one => `睡眠中（至 ${one.wakeAt === null ? '未知' : one.wakeAt.slice(0, 16).replace('T', ' ')}）`).join('；')}
          </span>
        )}
        {notice !== '' && <span style={styles.hint}>{notice}</span>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant='outline' size='sm' onClick={props.onClose} disabled={busy}>关闭</Button>
          <Button variant='primary' size='sm' disabled={busy} onClick={() => {
            setBusy(true); setNotice('')
            void Promise.all(values.map(one => props.face.setSelfState({ id: props.cardId, key: one.key, value: one.value })))
              .then(
                () => { setBusy(false); setNotice('已保存') },
                (error: unknown) => { setBusy(false); setNotice(`保存失败：${error instanceof Error ? error.message : String(error)}`) },
              )
          }}>{busy ? '保存中…' : '保存'}</Button>
        </div>
      </div>
    </Modal>
  )
}

const PARAM_LABELS: Record<string, string> = {
  valence: '愉悦度', arousal: '激活度', dominance: '掌控感', stamina: '体力', trust: '信任',
  attachment: '依恋', solidarity: '亲近', status: '地位', commitment: '承诺',
}

const REASON_LABELS: Record<string, string> = {
  appraisal: '事件评价', decay: '自然衰减', manual: '手动修改', system: '系统',
}

function ChangeLogModal(props: { face: MemoryFace; cardId: string; onClose(): void }): ReactNode {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (typeof props.face.emotionChangeLog !== 'function') {
      setError('当前宿主未提供变动记录接口，请重启应用后再试。')
      return
    }
    try {
      void props.face.emotionChangeLog({ id: props.cardId, limit: 200 }).then(
        value => { setRows(value.rows) },
        (cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)) },
      )
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [props.cardId, props.face])
  return (
    <Modal open onClose={props.onClose} title='变动记录' closeLabel='关闭' className={css.xwide} contentClassName={css.body}>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, padding: 16 }}>
        {error !== '' && <span style={styles.hint}>{error}</span>}
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>时间</th><th style={styles.th}>对象</th><th style={styles.th}>参数</th>
              <th style={styles.th}>前值</th><th style={styles.th}>变化</th><th style={styles.th}>后值</th>
              <th style={styles.th}>原因</th><th style={styles.th}>触发</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={String(row.id ?? index)}>
                <td style={{ ...styles.td, whiteSpace: 'nowrap' as const }}>{String(row.ts ?? '').slice(0, 16).replace('T', ' ')}</td>
                <td style={styles.td}>{row.scope === 'entity' ? String(row.entity_name ?? '') : '己'}</td>
                <td style={styles.td}>{PARAM_LABELS[String(row.param ?? '')] ?? String(row.param ?? '')}</td>
                <td style={styles.td}>{Number(row.before ?? 0).toFixed(2)}</td>
                <td style={styles.td}>{Number(row.delta ?? 0) >= 0 ? '+' : ''}{Number(row.delta ?? 0).toFixed(2)}</td>
                <td style={styles.td}>{Number(row.after ?? 0).toFixed(2)}</td>
                <td style={styles.td}>{REASON_LABELS[String(row.reason ?? '')] ?? String(row.reason ?? '')}</td>
                <td style={styles.td}>{String(row.message ?? row.cause_text ?? '')}</td>
              </tr>
            ))}
            {rows.length === 0 && error === '' && <tr><td style={styles.td} colSpan={8}>（暂无记录）</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

function RelationsModal(props: { face: MemoryFace; cardId: string; mode: 'entity' | 'memory' | 'dream'; onClose(): void }): ReactNode {
  const { face, cardId, mode, onClose } = props
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [name, setName] = useState('')
  const [extra, setExtra] = useState('')
  const [content, setContent] = useState('')
  const [role, setRole] = useState('user')
  const [salience, setSalience] = useState(0.5)
  const [busy, setBusy] = useState(false)

  const load = (): void => {
    if (mode === 'dream') {
      void face.dreamList({ id: cardId }).then(value => setRows(value.dreams as unknown as Array<Record<string, unknown>>), () => {})
      return
    }
    if (mode === 'memory') {
      void face.listMemories({ id: cardId, query }).then(value => setRows(value.rows), () => {})
    } else {
      void face.listEntities({ id: cardId, query }).then(value => setRows(value.rows), () => {})
    }
  }
  useEffect(load, [cardId, mode])

  const add = (): void => {
    setBusy(true)
    if (mode === 'memory') {
      void face.addMemory({ id: cardId, kind: role, content, salience }).then(() => { setContent(''); setBusy(false); load() }, () => setBusy(false))
    } else {
      void face.saveEntity({ id: cardId, entity: { name, cognition: extra } }).then(() => { setName(''); setExtra(''); setBusy(false); load() }, () => setBusy(false))
    }
  }
  const remove = (entityId: string): void => {
    if (mode === 'memory') void face.deleteMemory({ id: cardId, memoryId: entityId }).then(load, () => {})
    else void face.deleteEntity({ id: cardId, entityId }).then(load, () => {})
  }

  const attitudeKeys = [...new Set(rows.flatMap(row => ((row.attitudes as Array<{ key: string; value: number }> | undefined) ?? []).map(a => a.key)))]

  const title = mode === 'entity' ? '关系' : mode === 'dream' ? '梦境记录' : '记忆记录'
  return (
    <Modal open onClose={onClose} title={title} closeLabel='关闭' className={css.xwide} contentClassName={css.body}>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10, padding: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input style={{ flex: 1 }} value={query} placeholder='按名称/内容搜索' onChange={event => setQuery(event.target.value)} />
          <Button variant='outline' size='sm' onClick={load}>搜索</Button>
        </div>

        {mode === 'entity' ? (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {rows.length === 0 && <span style={styles.hint}>（暂无记录）</span>}
            {rows.map(row => {
              const saveRow = (): void => {
                void face.saveEntity({ id: cardId, entity: { id: row.id, name: row.name, cognition: row.cognition } }).then(load, () => {})
              }
              return (
                <div key={String(row.id)} style={styles.entityRow}>
                  <label style={{ ...styles.entityCell, flex: '1 1 120px' }}>
                    <span style={styles.fieldLabel}>名称</span>
                    <input style={{ ...styles.input, fontSize: 12 }} value={String(row.name ?? '')}
                      onChange={event => { const value = event.target.value; setRows(current => current.map(item => item.id === row.id ? { ...item, name: value } : item)) }}
                      onBlur={saveRow} />
                  </label>
                  <label style={{ ...styles.entityCell, flex: '2 1 240px' }}>
                    <span style={styles.fieldLabel}>认知</span>
                    <input style={{ ...styles.input, fontSize: 12 }} value={String(row.cognition ?? '')}
                      onChange={event => { const value = event.target.value; setRows(current => current.map(item => item.id === row.id ? { ...item, cognition: value } : item)) }}
                      onBlur={saveRow} />
                  </label>
                  {attitudeKeys.map(key => {
                    const found = ((row.attitudes as Array<{ key: string; value: number }> | undefined) ?? []).find(a => a.key === key)
                    return (
                      <label key={key} style={{ ...styles.entityCell, flex: '0 0 64px' }}>
                        <span style={styles.fieldLabel}>{ATTITUDE_LABELS[key] ?? key}</span>
                        <input type='number' min={key === 'status' || key === 'trust' ? -1 : 0} max={1} step={0.01} style={{ ...styles.input, fontSize: 12, textAlign: 'center' as const }}
                          value={found?.value ?? 0}
                          onChange={event => {
                            const value = Number(event.target.value)
                            setRows(current => current.map(item => item.id === row.id
                              ? { ...item, attitudes: [...((item.attitudes as Array<{ key: string; value: number }> | undefined) ?? []).filter(a => a.key !== key), { key, value }] }
                              : item))
                          }}
                          onBlur={() => { void face.setEntityState({ id: cardId, entityId: String(row.id), key, value: found?.value ?? 0 }).catch(() => {}) }} />
                      </label>
                    )
                  })}
                  <div style={{ ...styles.entityCell, flex: '0 0 auto', justifyContent: 'flex-end' }}>
                    <Button variant='outline' size='sm' onClick={() => remove(String(row.id))}>删除</Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              {mode === 'dream'
                ? <tr><th style={styles.th}>时间</th><th style={styles.th}>梦境</th></tr>
                : <tr><th style={styles.th}>时间</th><th style={styles.th}>角色</th><th style={styles.th}>内容</th><th style={styles.th}>震撼值</th><th style={styles.th}>操作</th></tr>}
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={String(row.id)}>
                  {mode === 'dream' ? (
                    <>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap' as const, maxWidth: 'none' }}>{String(row.addedAt ?? '').slice(0, 16).replace('T', ' ')}</td>
                      <td style={styles.td}>{String(row.content ?? '')}</td>
                    </>
                  ) : (
                    <>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap' as const, maxWidth: 'none' }}>{String(row.created_at ?? '').slice(0, 16).replace('T', ' ')}</td>
                      <td style={styles.td}>{KIND_LABELS[String(row.kind ?? '')] ?? String(row.kind ?? '')}</td>
                      <td style={styles.td}>{String(row.content ?? '')}</td>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap' as const, maxWidth: 'none' }}>{Number(row.salience ?? 0).toFixed(2)}</td>
                    </>
                  )}
                  {mode !== 'dream' && <td style={styles.td}><Button variant='outline' size='sm' onClick={() => remove(String(row.id), String(row.kind ?? ''))}>删除</Button></td>}
                </tr>
              ))}
              {rows.length === 0 && <tr><td style={styles.td} colSpan={mode === 'dream' ? 2 : 5}>（暂无记录）</td></tr>}
            </tbody>
          </table>
        )}

        {mode !== 'dream' && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {mode === 'memory' ? (
            <>
              <select style={styles.input} value={role} onChange={event => setRole(event.target.value)}>
                <option value='user'>用户</option>
                <option value='assistant'>助手</option>
              </select>
              <Input style={{ flex: 1, minWidth: 200 }} value={content} placeholder='记忆内容' onChange={event => setContent(event.target.value)} />
              <Input style={{ width: 90 }} value={String(salience)} placeholder='震撼值' onChange={event => setSalience(Number(event.target.value) || 0)} />
              <Button variant='primary' size='sm' disabled={busy || content.trim() === '' || salience < 0 || salience > 1} onClick={add}>添加</Button>
            </>
          ) : (
            <>
              <Input style={{ flex: 1, minWidth: 140 }} value={name} placeholder='名称' onChange={event => setName(event.target.value)} />
              <Input style={{ flex: 2, minWidth: 220 }} value={extra} placeholder='认知（身份、外号、关系等）' onChange={event => setExtra(event.target.value)} />
              <Button variant='primary' size='sm' disabled={busy || name.trim() === ''} onClick={add}>添加</Button>
            </>
          )}
        </div>}
      </div>
    </Modal>
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
  fieldRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  field: { display: 'flex', flexDirection: 'column' as const, gap: 4, minWidth: 0 },
  fieldLabel: { fontSize: 13, opacity: 0.75 },
  fieldHead: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  entityRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 8, alignItems: 'flex-end', padding: '8px 10px', border: '1px solid var(--dsh-border, #ddd)', borderRadius: 10 },
  entityCell: { display: 'flex', flexDirection: 'column' as const, gap: 3, minWidth: 0 },
  th: { textAlign: 'left' as const, padding: '4px 8px', borderBottom: '1px solid var(--dsh-border, #ccc)', opacity: 0.7 },
  td: { padding: '4px 8px', borderBottom: '1px solid var(--dsh-border, rgba(127,127,127,0.2))', whiteSpace: 'normal' as const, wordBreak: 'break-word' as const, maxWidth: 360 },
  input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)' },
  dangerButton: { color: 'var(--dsw-alias-state-error-primary, #c0392b)' },
  editorFooter: { display: 'flex', alignItems: 'center', gap: 8 },
  modalBody: { display: 'flex', flexDirection: 'column' as const, gap: 10, minWidth: 420 },
  modalInput: { width: '100%' },
  resultList: {
    display: 'flex', flexDirection: 'column' as const, gap: 6,
    maxHeight: 320, overflowY: 'auto' as const,
  },
  resultItem: {
    display: 'flex', gap: 10, alignItems: 'baseline',
    padding: '8px 10px', borderRadius: 8,
    background: 'var(--dsh-surface, rgba(127,127,127,0.08))',
  },
  resultDistance: { fontFamily: 'monospace', fontSize: 12, opacity: 0.65, flexShrink: 0 },
  resultContent: { fontSize: 13, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const },
}
