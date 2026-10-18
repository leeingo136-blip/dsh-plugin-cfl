/**
 * 设置-知识库：本地 sqlite-vec 知识库的配置、入库、查询与删除。
 * 库卡片显示名称/描述/向量模型/维度/条目数；顶部新建表单；
 * 每张卡内嵌查询框与入库文本框。
 */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { KnowledgeKey } from './locales.ts'

export interface RagDatabase {
  id: string
  name: string
  description: string
  model: string
  dimension: number
  chunks: number
}

export interface RagHit {
  content: string
  distance: number
}

export interface RagFace {
  t(key: keyof KnowledgeKey): string
  list(): Promise<{ databases: RagDatabase[] }>
  create(name: string, description: string): Promise<unknown>
  remove(id: string): Promise<void>
  ingest(id: string, texts: readonly string[]): Promise<{ count: number }>
  query(id: string, text: string, k: number): Promise<{ results: RagHit[] }>
}

export function KnowledgeSection(props: { face?: RagFace }): ReactNode {
  const { face } = props
  if (face === undefined) return null
  return <RagLoaded face={face} />
}

function RagLoaded({ face }: { face: RagFace }): ReactNode {
  const [databases, setDatabases] = useState<readonly RagDatabase[]>([])
  const [failed, setFailed] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = (): void => {
    void face.list().then(
      value => { setDatabases(value.databases); setFailed(null) },
      (error: unknown) => setFailed(error instanceof Error ? error.message : String(error)),
    )
  }
  useEffect(refresh, [face])

  return (
    <div>
      <div style={styles.createRow}>
        <input
          style={{ ...styles.input, flex: 1 }}
          placeholder={face.t('ragName')}
          value={name}
          onChange={event => { setName(event.target.value) }}
        />
        <input
          style={{ ...styles.input, flex: 2 }}
          placeholder={face.t('ragDescription')}
          value={description}
          onChange={event => { setDescription(event.target.value) }}
        />
        <Button
          variant='primary'
          size='sm'
          disabled={name.trim() === '' || busy}
          onClick={() => {
            setBusy(true)
            void face.create(name.trim(), description.trim()).then(() => {
              setName(''); setDescription(''); setBusy(false); refresh()
            }, (error: unknown) => {
              setBusy(false)
              setFailed(error instanceof Error ? error.message : String(error))
            })
          }}
        >
          {face.t('ragAdd')}
        </Button>
      </div>
      {failed !== null && <p style={styles.error}>{face.t('loadFailed')}{' — '}{failed}</p>}
      {databases.length === 0
        ? <p>{face.t('empty')}</p>
        : (
            <div style={styles.grid}>
              {databases.map(database => (
                <DatabaseCard key={database.id} face={face} database={database} onChange={refresh} />
              ))}
            </div>
          )}
    </div>
  )
}

function DatabaseCard(props: { face: RagFace; database: RagDatabase; onChange(): void }): ReactNode {
  const { face, database, onChange } = props
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(5)
  const [hits, setHits] = useState<readonly RagHit[]>([])
  const [ingestText, setIngestText] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <div style={styles.card}>
      <div style={styles.cardHead}>
        <strong style={styles.cardName}>{database.name}</strong>
        <span style={{ flex: 1 }} />
        <span style={styles.meta}>
          {face.t('ragChunks')} {database.chunks}
          {' · '}
          {face.t('ragDims')} {database.dimension}
          {database.model !== '' && <> · {face.t('ragModel')} {database.model}</>}
        </span>
        <Button
          variant='outline'
          size='sm'
          style={styles.dangerButton}
          onClick={() => {
            if (!window.confirm(face.t('ragDeleteConfirm'))) return
            void face.remove(database.id).then(onChange)
          }}
        >
          {face.t('delete')}
        </Button>
      </div>
      {database.description !== '' && <p style={styles.cardDescription}>{database.description}</p>}

      <div style={styles.row}>
        <input
          style={{ ...styles.input, flex: 1 }}
          placeholder={face.t('ragQueryPlaceholder')}
          value={query}
          onChange={event => { setQuery(event.target.value) }}
          onKeyDown={event => {
            if (event.key === 'Enter' && query.trim() !== '') {
              void face.query(database.id, query.trim(), topK).then(
                value => { setHits(value.results); setError(null) },
                (error: unknown) => setError(error instanceof Error ? error.message : String(error)),
              )
            }
          }}
        />
        <label style={styles.meta}>
          {face.t('ragTopK')}
          {' '}
          <input
            type='number'
            min={1}
            max={50}
            value={topK}
            onChange={event => { setTopK(Number(event.target.value) || 5) }}
            style={{ ...styles.input, width: 64 }}
          />
        </label>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            void face.query(database.id, query.trim(), topK).then(
              value => { setHits(value.results); setError(null) },
              (error: unknown) => setError(error instanceof Error ? error.message : String(error)),
            )
          }}
        >
          {face.t('ragRun')}
        </Button>
      </div>

      <textarea
        style={styles.textarea}
        rows={3}
        placeholder={face.t('ragIngestPlaceholder')}
        value={ingestText}
        onChange={event => { setIngestText(event.target.value) }}
      />
      <div style={styles.row}>
        <Button
          variant='outline'
          size='sm'
          disabled={ingestText.trim() === ''}
          onClick={() => {
            const texts = ingestText.split('\n').map(one => one.trim()).filter(one => one !== '')
            void face.ingest(database.id, texts).then(value => {
              setIngestText('')
              setNotice(`${face.t('ragIngest')}：${value.count}`)
              onChange()
            }, (error: unknown) => setError(error instanceof Error ? error.message : String(error)))
          }}
        >
          {face.t('ragIngest')}
        </Button>
        {notice !== null && <span style={styles.notice}>{notice}</span>}
        {error !== null && <span style={styles.error}>{error}</span>}
      </div>

      {hits.length > 0 && (
        <div>
          <p style={styles.resultsTitle}>{face.t('ragResults')}</p>
          {hits.map((hit, index) => (
            <div key={index} style={styles.hit}>
              <span style={styles.hitDistance}>{hit.distance.toFixed(4)}</span>
              <span style={styles.hitContent}>{hit.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  createRow: { display: 'flex', gap: 8, marginBottom: 12 },
  input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)' },
  dangerButton: { color: 'var(--dsw-alias-state-error-primary, #c0392b)' },
  error: { color: '#c0392b', fontSize: 13 },
  notice: { color: '#2e7d32', fontSize: 13 },
  grid: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  card: {
    border: '1px solid var(--dsh-border, #ddd)', borderRadius: 10,
    padding: '10px 14px', display: 'flex', flexDirection: 'column' as const, gap: 8,
  },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 14 },
  cardDescription: { margin: 0, fontSize: 13, opacity: 0.8 },
  meta: { fontSize: 12, opacity: 0.65, whiteSpace: 'nowrap' as const },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  textarea: {
    width: '100%', boxSizing: 'border-box' as const, fontSize: 13,
    borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)', padding: 8, resize: 'vertical' as const,
  },
  resultsTitle: { margin: '4px 0', fontSize: 13, fontWeight: 600 },
  hit: { display: 'flex', gap: 10, padding: '6px 8px', borderRadius: 6, background: 'var(--dsh-surface, rgba(127,127,127,0.08))', marginBottom: 4 },
  hitDistance: { fontSize: 12, fontFamily: 'monospace', opacity: 0.7, minWidth: 56 },
  hitContent: { fontSize: 13, whiteSpace: 'pre-wrap' as const },
}
