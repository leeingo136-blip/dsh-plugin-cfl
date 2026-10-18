/**
 * 设置-技能：全部技能一卡一条。可编辑来源的卡片点「编辑」后原位变为编辑态
 * （名称/正文/来源下拉），插件与会话技能只读；顶部搜索按名称/来源/正文过滤
 * （三个勾选框可多选）；右上「新建」在顶部给出可编辑空卡，名称/正文/来源齐全
 * 才可保存，冲突由宿主按 kebab-case 后缀规则自动重命名。
 */
import { useEffect, useMemo, useState } from 'react'
import type { KnowledgeKey } from './locales.ts'

export interface SkillCard {
  name: string
  description: string
  sourceId: string
  sourceLabel: string
  editable: boolean
  form: 'dir' | 'flat' | 'runtime'
  path?: string
}

export interface SkillSourceOption {
  id: string
  label: string
  kind: 'global' | 'workspace' | 'bundled' | 'runtime'
  editable: boolean
  dir?: string
}

export interface SkillsFace {
  t(key: keyof KnowledgeKey): string
  listSkills(): Promise<{ skills: SkillCard[] }>
  listSources(): Promise<{ sources: SkillSourceOption[] }>
  readSkill(name: string, sourceId: string): Promise<{ body: string }>
  saveSkill(request: {
    fromName?: string
    fromSourceId?: string
    targetSourceId: string
    name: string
    body: string
  }): Promise<{ name: string; renamed: boolean; created: boolean }>
  deleteSkill(name: string, sourceId: string): Promise<void>
}

type Filter = 'name' | 'source' | 'body'
const FILTERS: Filter[] = ['name', 'source', 'body']

/** 卡片右侧的小字来源标签。 */
function SourceTag({ label, t }: { label: string; t: SkillsFace['t'] }): ReactNode {
  return <span style={styles.sourceTag}>{label}</span>
}

export function SkillsSection(props: { face?: SkillsFace }): ReactNode {
  const { face } = props
  if (face === undefined) return null
  return <SkillsLoaded face={face} />
}

function SkillsLoaded({ face }: { face: SkillsFace }): ReactNode {
  const [skills, setSkills] = useState<readonly SkillCard[]>([])
  const [sources, setSources] = useState<readonly SkillSourceOption[]>([])
  const [failed, setFailed] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Set<Filter>>(() => new Set(['name']))
  const [editing, setEditing] = useState<EditState | undefined>(undefined)
  const [notice, setNotice] = useState<string | null>(null)
  const [bodies, setBodies] = useState<ReadonlyMap<string, string>>(() => new Map())

  const refresh = (): void => {
    void face.listSkills().then(
      value => { setSkills(value.skills); setFailed(null) },
      (error: unknown) => setFailed(error instanceof Error ? error.message : String(error)),
    )
    void face.listSources().then(value => setSources(value.sources))
  }
  useEffect(refresh, [face])

  const closeEditor = (message: string | undefined, renamed?: boolean): void => {
    setEditing(undefined)
    if (message !== undefined) setNotice(renamed === true ? face.t('savedRenamed') : message)
    refresh()
  }

  // 正文搜索需要正文：勾选「正文」后批量拉取并缓存（本地文件，量小）。
  useEffect(() => {
    if (!filters.has('body')) return
    for (const skill of skills) {
      const key = `${skill.sourceId}\u0000${skill.name}`
      if (bodies.has(key) || !skill.editable && skill.form === 'runtime') continue
      void face.readSkill(skill.name, skill.sourceId).then(
        value => setBodies(previous => new Map(previous).set(key, value.body)),
        () => undefined,
      )
    }
  }, [filters, skills, face]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (text === '') return skills
    const active = [...filters]
    if (active.length === 0) return []
    return skills.filter(skill => active.some(filter => {
      if (filter === 'name') return skill.name.toLowerCase().includes(text)
      if (filter === 'source') return skill.sourceLabel.toLowerCase().includes(text)
      const key = `${skill.sourceId}\u0000${skill.name}`
      const body = bodies.get(key) ?? skill.description
      return body.toLowerCase().includes(text)
    }))
  }, [skills, query, filters, bodies])

  if (failed !== null) {
    return <div><p>{face.t('loadFailed')}{' — '}{failed}</p></div>
  }

  return (
    <div>
      <div style={styles.toolbar}>
        <input
          style={styles.search}
          placeholder={face.t('search')}
          value={query}
          onChange={event => { setQuery(event.target.value) }}
        />
        <div style={styles.filters}>
          {FILTERS.map(filter => (
            <label key={filter} style={styles.filterLabel}>
              <input
                type='checkbox'
                checked={filters.has(filter)}
                onChange={() => {
                  setFilters(previous => {
                    const next = new Set(previous)
                    if (next.has(filter)) {
                      // 至少保留一个维度，避免空集等于全隐藏。
                      if (next.size > 1) next.delete(filter)
                    } else {
                      next.add(filter)
                    }
                    return next
                  })
                }}
              />
              {' '}
              {face.t(filter === 'name' ? 'byName' : filter === 'source' ? 'bySource' : 'byBody')}
            </label>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button
          style={styles.primaryButton}
          onClick={() => {
            setNotice(null)
            setEditing({
              fromName: undefined, fromSourceId: undefined,
              name: '', body: '', sourceId: sources.find(one => one.editable)?.id ?? '',
            })
          }}
        >
          {face.t('create')}
        </button>
      </div>

      {notice !== null && <p style={styles.notice}>{notice}</p>}

      {editing !== undefined && editing.fromName === undefined && (
        <SkillEditor
          face={face}
          sources={sources}
          state={editing}
          onClose={closeEditor}
        />
      )}

      {shown.length === 0
        ? <p>{face.t('noResults')}</p>
        : (
            <div style={styles.grid}>
              {shown.map(skill => {
                const editingThis = editing !== undefined &&
                  editing.fromName === skill.name &&
                  editing.fromSourceId === skill.sourceId
                if (editingThis) {
                  return (
                    <SkillEditor
                      key={`${skill.sourceId}\u0000${skill.name}`}
                      face={face}
                      sources={sources}
                      state={editing}
                      onClose={closeEditor}
                    />
                  )
                }
                return (
                  <SkillCardView
                    key={`${skill.sourceId}\u0000${skill.name}`}
                    face={face}
                    skill={skill}
                    body={bodies.get(`${skill.sourceId}\u0000${skill.name}`) ?? skill.description}
                    onEdit={() => {
                      setNotice(null)
                      void face.readSkill(skill.name, skill.sourceId).then(value => {
                        setEditing({
                          fromName: skill.name, fromSourceId: skill.sourceId,
                          name: skill.name, body: value.body, sourceId: skill.sourceId,
                        })
                      })
                    }}
                    onDelete={() => {
                      if (!window.confirm(face.t('confirmDelete'))) return
                      void face.deleteSkill(skill.name, skill.sourceId).then(refresh)
                    }}
                  />
                )
              })}
            </div>
          )}
    </div>
  )
}

interface EditState {
  fromName: string | undefined
  fromSourceId: string | undefined
  name: string
  body: string
  sourceId: string
}

function SkillCardView(props: {
  face: SkillsFace
  skill: SkillCard
  body: string
  onEdit(): void
  onDelete(): void
}): ReactNode {
  const { face, skill, body, onEdit, onDelete } = props
  return (
    <div style={styles.card}>
      <div style={styles.cardHead}>
        <strong style={styles.cardName}>{skill.name}</strong>
        <span style={{ flex: 1 }} />
        <SourceTag label={skill.sourceLabel} t={face.t} />
        {skill.editable && (
          <>
            <button style={styles.button} onClick={onEdit}>{face.t('edit')}</button>
            <button style={styles.dangerButton} onClick={onDelete}>{face.t('delete')}</button>
          </>
        )}
      </div>
      {skill.description !== '' && <p style={styles.cardDescription}>{skill.description}</p>}
      {body !== '' && body !== skill.description && <pre style={styles.cardBody}>{clip(body, 8)}</pre>}
    </div>
  )
}

function clip(text: string, maxLines: number): string {
  const lines = text.split('\n')
  return lines.length <= maxLines ? text : `${lines.slice(0, maxLines).join('\n')}\n…`
}

function SkillEditor(props: {
  face: SkillsFace
  sources: readonly SkillSourceOption[]
  state: EditState
  onClose(message: string | undefined, renamed?: boolean): void
}): ReactNode {
  const { face, sources, state, onClose } = props
  const [name, setName] = useState(state.fromName ?? '')
  const [body, setBody] = useState(state.body)
  const [sourceId, setSourceId] = useState(state.sourceId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const complete = name.trim() !== '' && body.trim() !== '' && sourceId !== ''
  return (
    <div style={styles.editor}>
      <div style={styles.cardHead}>
        <input
          style={{ ...styles.input, flex: 1 }}
          placeholder={face.t('namePlaceholder')}
          value={name}
          onChange={event => { setName(event.target.value) }}
        />
        <select
          style={styles.input}
          value={sourceId}
          onChange={event => { setSourceId(event.target.value) }}
        >
          {sources.filter(one => one.editable).map(one => (
            <option key={one.id} value={one.id}>{one.label}</option>
          ))}
        </select>
        <button
          style={{ ...styles.primaryButton, opacity: complete && !busy ? 1 : 0.5 }}
          disabled={!complete || busy}
          onClick={() => {
            setBusy(true)
            setError(null)
            void face.saveSkill({
              fromName: state.fromName,
              fromSourceId: state.fromSourceId,
              targetSourceId: sourceId,
              name: name.trim(),
              body,
            }).then(result => {
              setBusy(false)
              onClose(result.renamed ? face.t('savedRenamed') : face.t('saved'), result.renamed)
            }, (saveError: unknown) => {
              setBusy(false)
              setError(saveError instanceof Error ? saveError.message : String(saveError))
            })
          }}
        >
          {face.t('save')}
        </button>
        <button style={styles.button} onClick={() => { onClose(undefined) }}>{face.t('cancel')}</button>
      </div>
      {error !== null && <p style={styles.error}>{face.t('saveFailed')}{' — '}{error}</p>}
      <textarea
        style={styles.textarea}
        placeholder={face.t('bodyPlaceholder')}
        value={body}
        onChange={event => { setBody(event.target.value) }}
        rows={12}
      />
    </div>
  )
}

const styles = {
  toolbar: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  search: { flex: 1, maxWidth: 320, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)' },
  filters: { display: 'flex', gap: 12, marginLeft: 8 },
  filterLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, whiteSpace: 'nowrap' as const },
  primaryButton: { padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600 },
  button: { padding: '4px 12px', borderRadius: 8, cursor: 'pointer' },
  dangerButton: { padding: '4px 12px', borderRadius: 8, cursor: 'pointer', color: '#c0392b' },
  notice: { color: '#2e7d32', fontSize: 13 },
  error: { color: '#c0392b', fontSize: 13 },
  grid: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  card: { border: '1px solid var(--dsh-border, #ddd)', borderRadius: 10, padding: '10px 14px' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 14 },
  sourceTag: { fontSize: 12, opacity: 0.65, whiteSpace: 'nowrap' as const },
  cardDescription: { margin: '6px 0 0', fontSize: 13, opacity: 0.8 },
  cardBody: {
    margin: '6px 0 0', fontSize: 12, whiteSpace: 'pre-wrap' as const,
    background: 'var(--dsh-surface, rgba(127,127,127,0.08))', padding: 8, borderRadius: 6,
  },
  editor: {
    border: '1px solid var(--dsh-border, #ccc)', borderRadius: 10,
    padding: '10px 14px', marginBottom: 12, display: 'flex', flexDirection: 'column' as const, gap: 8,
  },
  input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)' },
  textarea: {
    width: '100%', boxSizing: 'border-box' as const, fontFamily: 'monospace', fontSize: 13,
    borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)', padding: 8, resize: 'vertical' as const,
  },
}
