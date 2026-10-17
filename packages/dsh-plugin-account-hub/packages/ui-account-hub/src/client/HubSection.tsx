/**
 * Rendered seats of the settings account column: the section wrapper, its
 * loaded row list, and one account's models-page provider card. Split from the
 * client entry because the shared client preset resolves `src/client/index.ts`
 * as the bundle input, and a JSX-bearing entry leaves that path unresolvable
 * for tooling reading the preset (the third-party notices generator among it).
 */
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { ProviderCardExtrasOwnerProps } from '@dsh/ui-settings-models/client'
import type { AccountHubType } from '@dsh/api-account-hub'
import type { AccountHubRowOwnerProps, AccountHubSectionFace, AccountRow } from './index.ts'
import type { AccountHubKey } from './locales.ts'
import { HubAccountCard } from './HubAccountCard.tsx'

/** Display order of the capability groups; a group with no rows renders nothing. */
const GROUP_ORDER: readonly AccountHubType[] = ['chat', 'embedding', 'tts', 'asr']

/** The locale key of each group's heading. */
const GROUP_KEYS: Record<AccountHubType, AccountHubKey> = {
  chat: 'groupChat',
  embedding: 'groupEmbedding',
  tts: 'groupTts',
  asr: 'groupAsr',
}

/** Style of the group heading shown only when several families coexist. */
const GROUP_HEADING: CSSProperties = { margin: '10px 0 4px', fontSize: 12, fontWeight: 500, opacity: 0.65 }

/** One registered account as a seat holds it. */
interface RowState {
  row: AccountRow
}

/** The row slot as the account column calls it. */
type AccountHubRenderSlot = (
  name: 'account.hub.row',
  owner: AccountHubRowOwnerProps,
  options: { entryKey: string },
) => ReactNode

/**
 * Render the settings account column: the registry read lives here, row
 * content is delegated per account to the `account.hub.row` slot.
 * @param props - slot-delivered injected dependencies.
 * @returns the section, or null while the shell has not injected yet.
 */
export function AccountHubSection(props: { face?: AccountHubSectionFace; renderSlot?: unknown }): ReactNode {
  const { face, renderSlot } = props
  if (face === undefined || renderSlot === undefined) return null
  return <Loaded face={face} renderSlot={renderSlot as AccountHubRenderSlot} />
}

/** @param props - the resolved face and the row renderer. @returns the row list. */
function Loaded({ face, renderSlot }: { face: AccountHubSectionFace; renderSlot: AccountHubRenderSlot }): ReactNode {
  const [rows, setRows] = useState<readonly RowState[]>([])
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const refresh = (): void => {
      void face.list().then(
        (value) => {
          if (!alive) return
          setRows(value.map(row => ({ row }))); setFailed(null)
          for (const row of value) {
            if (row.modelsCard === true) face.ensureModelsCard(row.settingsNs)
          }
        },
        (error: unknown) => { if (alive) setFailed(error instanceof Error ? error.message : String(error)) },
      )
    }
    refresh()
    const dispose = face.subscribe(refresh)
    return () => { alive = false; dispose() }
  }, [face])
  return (
    <div>
      {failed !== null ? <p>{face.t('loadFailed')}{' — '}{failed}</p>
        : rows.length === 0 ? <p>{face.t('empty')}</p>
          : groups.length <= 1 ? rows.map(({ row }) => renderRow(row))
            : groups.map(group => (
              <div key={group.type}>
                <p style={GROUP_HEADING}>{face.t(GROUP_KEYS[group.type])}</p>
                {group.rows.map(({ row }) => renderRow(row))}
              </div>
            ))}
    </div>
  )

  /** Render one row: the declarative card, or the plugin's own slot row. */
  function renderRow(row: AccountRow): ReactNode {
    return row.card !== undefined ? (
      <HubAccountCard
        key={row.id}
        t={face.t}
        row={row}
        invoke={(method: string, args: unknown) => face.invoke(row.id, method, args)}
        readParams={() => face.readParams(row.id)}
        commitParams={ops => face.commitParams(row.id, ops)}
      />
    ) : renderSlot('account.hub.row', {
      accountId: row.id, displayName: row.displayName, state: row.state,
      invoke: (method: string, args: unknown) => face.invoke(row.id, method, args),
    }, { entryKey: row.id })
  }

  /** Group the rows by resolved capability family, in display order. */
  function groups(): { type: AccountHubType; rows: readonly RowState[] }[] {
    return GROUP_ORDER
      .map(type => ({ type, rows: rows.filter(({ row }) => (row.type ?? 'chat') === type) }))
      .filter(group => group.rows.length > 0)
  }
}

/** Props of the models-page provider-card seat: the row's owner facts plus the hub face. */
type ProviderModelsCardProps = ProviderCardExtrasOwnerProps & { face: AccountHubSectionFace }

/**
 * Draw one account's models-page provider card. The seat renders for every
 * directory row; only the account that opted in through `modelsCard` finds a
 * matching row, so every other provider renders nothing.
 * @param props - the row's owner facts and the hub face.
 * @returns the account's models-surface card, or nothing.
 */
export function ProviderModelsCard(props: ProviderModelsCardProps): ReactNode {
  const { face } = props
  const settingsNs = props.provider.settingsNs
  const [row, setRow] = useState<AccountRow | null>(null)
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    let alive = true
    const refresh = (): void => {
      void face.list().then(
        (rows) => {
          if (!alive) return
          setRow(rows.find(candidate => candidate.settingsNs === settingsNs
            && candidate.modelsCard === true
            && (candidate.card?.fields.some(field => field.surface === 'models') === true)) ?? null)
          setSettled(true)
        },
        () => { if (alive) setSettled(true) },
      )
    }
    refresh()
    const dispose = face.subscribe(refresh)
    return () => { alive = false; dispose() }
  }, [face, settingsNs])
  if (!settled || row === null) return null
  return (
    <HubAccountCard
      t={face.t}
      row={row}
      surface="models"
      editor={props.editor}
      zone={props.zone}
      invoke={(method: string, args: unknown) => face.invoke(row.id, method, args)}
      readParams={() => face.readParams(row.id)}
      commitParams={ops => face.commitParams(row.id, ops)}
    />
  )
}
