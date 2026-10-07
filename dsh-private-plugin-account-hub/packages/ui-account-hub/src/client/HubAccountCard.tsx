/**
 * The hub-rendered account card: a declarative form drawn entirely from the
 * plugin's card descriptor. The plugin ships no browser code — its descriptor,
 * the values stored under its settings namespace (read back redacted), and its
 * invoke seam are the whole surface. Field kinds: text, password, checkbox,
 * select (static or plugin-served options), and buttons whose actions run
 * plugin-side (e.g. scanning the account's available models) and may push
 * fresh select options back.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AccountHubFieldDescriptor, AccountHubSelectOption } from '@dsh-private/api-account-hub'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { ProviderCardEditorAccess } from '@dsh-private/ui-settings-models/client'
import { Button, Checkbox, IconRightUpOutlineRegular, IconUserOutlineMedium, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { AccountHubKey } from './locales.ts'
import type { AccountRow } from './index.ts'
import css from './HubAccountCard.module.css'

/** Copy keys the generic card reads from the section dictionary. */
export type HubAccountCardCopy =
  | 'save' | 'saving' | 'saved' | 'saveFailed'
  | 'actionFailed' | 'optionsFailed' | 'busy' | 'selectPlaceholder'

/** Props the section hands one declarative account card. */
export interface HubAccountCardProps {
  t: (key: AccountHubKey) => string
  row: AccountRow
  /** Which surface renders this card: the account column (default) or the
   *  models-page provider card; fields tagged with the other surface hide. */
  surface?: 'account' | 'models'
  /** Forward one plugin-private operation through the hub. */
  invoke: (method: string, args: unknown) => Promise<unknown>
  /** Read the account's stored (redacted) parameters from its namespace. */
  readParams: () => Promise<unknown>
  /** Commit edited parameters into the account's settings namespace. */
  commitParams: (ops: SettingsPathOpView[]) => Promise<void>
  /** Draft access when dispatched inside an opened provider editor: a bound
   *  select edits the editor's pending draft instead of the stored params,
   *  and the editor's own save control commits it. Absent elsewhere. */
  editor?: ProviderCardEditorAccess | undefined
  /** Which editor area this occurrence occupies on the models surface (the
   *  editor dispatches the seat once per zone): fields declared for the
   *  catalog render only in the `catalog` occurrence, the rest only in the
   *  `editor` one. Absent on the legacy single dispatches, which render
   *  every surface field. */
  zone?: 'editor' | 'catalog' | undefined
}

type Notice = { tone: 'info' | 'error'; text: string }

/** Narrow an unknown value to a JSON object record; anything else is empty. */
function asRecord(value: unknown): Record<string, JsonValue> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, JsonValue>
}

function asString(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

function asBoolean(value: JsonValue | undefined): boolean {
  return value === true
}

/** Parse a plugin-served option payload; malformed entries are dropped. */
function parseOptions(value: JsonValue): AccountHubSelectOption[] {
  const rows: unknown = Array.isArray(value) ? value : asRecord(value).options
  if (!Array.isArray(rows)) return []
  return rows
    .map(row => ({ value: asString(asRecord(row).value), label: asString(asRecord(row).label) }))
    .filter(row => row.value !== '')
}

function sameValue(before: JsonValue | undefined, after: JsonValue | undefined): boolean {
  return JSON.stringify(before ?? null) === JSON.stringify(after ?? null)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Render one account's declarative card.
 * @param props - the row (with its card descriptor) and the hub seams.
 * @returns the card, redrawn from the descriptor alone.
 */
export function HubAccountCard(props: HubAccountCardProps): ReactNode {
  const { t, row, surface = 'account', invoke, readParams, commitParams, editor, zone } = props
  const status = asRecord(row.state)
  const visibleFields = useMemo<readonly AccountHubFieldDescriptor[]>(
    () => (row.card?.fields ?? []).filter((field) => {
      if (field.surface !== undefined && field.surface !== surface) return false
      if (field.when === 'signed-in' && status.signedIn !== true) return false
      if (field.when === 'signed-out' && status.signedIn === true) return false
      // Two-zone models dispatch: a field declared for the catalog renders
      // only in the catalog occurrence and vice versa; the legacy single
      // dispatch (no zone) renders every surface field.
      if (surface === 'models' && zone !== undefined
        && (field.placement === 'catalog') !== (zone === 'catalog')) return false
      return true
    }),
    [row.card, surface, status, zone],
  )
  const [initial, setInitial] = useState<Record<string, JsonValue>>({})
  const [values, setValues] = useState<Record<string, JsonValue>>({})
  const [options, setOptions] = useState<Record<string, AccountHubSelectOption[]>>({})
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // The open dialog field, its live input values, and its own notice line.
  const [dialogField, setDialogField] = useState<AccountHubFieldDescriptor | null>(null)
  const [dialogValues, setDialogValues] = useState<Record<string, JsonValue>>({})
  const [dialogNotice, setDialogNotice] = useState<Notice | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  // Load the stored (redacted) parameter values once per row.
  useEffect(() => {
    alive.current = true
    void (async () => {
      try {
        const stored = asRecord(await readParams())
        if (!alive.current) return
        setInitial(stored)
        setValues(stored)
        setNotice(null)
      } catch (error: unknown) {
        if (alive.current) setNotice({ tone: 'error', text: messageOf(error) })
      }
    })()
    return () => { alive.current = false }
  }, [readParams, row.id])

  // Selects without static choices load them through the plugin's invoke seam.
  const dynamicKeys = visibleFields
    .filter(field => field.kind === 'select' && field.options === undefined)
    .map(field => field.key)
  const dynamicKey = dynamicKeys.join('\u0000')
  useEffect(() => {
    if (dynamicKey === '') return
    void (async () => {
      for (const key of dynamicKey.split('\u0000')) {
        try {
          const raw = await invoke('options', { field: key })
          if (!alive.current) return
          setOptions(previous => ({ ...previous, [key]: parseOptions(raw as JsonValue) }))
        } catch (error: unknown) {
          if (!alive.current) return
          const field = visibleFields.find(candidate => candidate.key === key)
          setNotice({ tone: 'error', text: `${t('optionsFailed')} — ${field?.label ?? key}: ${messageOf(error)}` })
        }
      }
    })()
  }, [dynamicKey, invoke, visibleFields, t])

  const statusText = asString(status.text)
  const statusLevel = status.level === 'ok' || status.level === 'warn' || status.level === 'error'
    ? status.level
    : null
  const brand = asRecord(status.brand)
  const brandLogo = asString(brand.logoUrl)
  const brandName = asString(brand.name)

  if (visibleFields.length === 0) return null
  // Value fields participate in dirty tracking and the save commit; note and
  // dialog fields are pure presentation/actions and never persist anything.
  // A select bound to an opened editor's draft (`bind` + draft access) edits
  // that draft instead, so the editor's own save control owns the commit.
  const isDraftBound = (field: AccountHubFieldDescriptor): boolean =>
    field.kind === 'select' && field.bind !== undefined && editor !== undefined
  const isValueField = (field: AccountHubFieldDescriptor): boolean =>
    field.kind !== 'button' && field.kind !== 'dialog' && field.kind !== 'note'
  const dirty = visibleFields.some(field => isValueField(field) && !isDraftBound(field)
    && !sameValue(initial[field.key], values[field.key]))

  const setValue = (key: string, value: JsonValue): void => {
    setValues(previous => ({ ...previous, [key]: value }))
  }

  const save = (): void => {
    void (async () => {
      const ops: SettingsPathOpView[] = []
      for (const field of visibleFields) {
        if (!isValueField(field) || isDraftBound(field)) continue
        const before = initial[field.key]
        const after = values[field.key]
        if (sameValue(before, after)) continue
        if (after === undefined || after === '') ops.push({ op: 'unset', path: [field.key] })
        else ops.push({ op: 'set', path: [field.key], value: after })
      }
      if (ops.length === 0) return
      setBusy('save')
      try {
        await commitParams(ops)
        if (!alive.current) return
        setInitial({ ...values })
        setNotice({ tone: 'info', text: t('saved') })
      } catch (error: unknown) {
        if (alive.current) setNotice({ tone: 'error', text: `${t('saveFailed')}: ${messageOf(error)}` })
      } finally {
        if (alive.current) setBusy(null)
      }
    })()
  }

  const runAction = (field: AccountHubFieldDescriptor): void => {
    const action = field.action
    if (action === undefined) return
    void (async () => {
      setBusy(field.key)
      setNotice(null)
      try {
        const raw = asRecord(await invoke(action, { values }))
        if (!alive.current) return
        const updates = Array.isArray(raw.options) ? raw.options : []
        if (updates.length > 0) {
          setOptions((previous) => {
            const next = { ...previous }
            for (const update of updates) {
              const record = asRecord(update)
              const key = asString(record.field)
              if (key !== '') next[key] = parseOptions(record.choices as JsonValue)
            }
            return next
          })
        }
        const message = asString(raw.message)
        if (message !== '') setNotice({ tone: 'info', text: message })
      } catch (error: unknown) {
        if (alive.current) setNotice({ tone: 'error', text: `${t('actionFailed')}: ${messageOf(error)}` })
      } finally {
        if (alive.current) setBusy(null)
      }
    })()
  }

  /** Close the open dialog, discarding its draft values and notice. */
  const closeDialog = (): void => {
    if (dialogBusy) return
    setDialogField(null)
    setDialogValues({})
    setDialogNotice(null)
  }

  /** Run one dialog field's action with the entered values merged in; the
    * result's message shows inside the modal and `close: true` dismisses it
    * after a beat so the outcome stays readable. */
  const runDialogSubmit = (): void => {
    const field = dialogField
    if (field === null) return
    const action = field.action
    if (action === undefined) return
    void (async () => {
      setDialogBusy(true)
      setDialogNotice(null)
      try {
        const raw = asRecord(await invoke(action,
          { values: { ...values, ...dialogValues } as JsonValue }))
        if (!alive.current) return
        const message = asString(raw.message)
        if (message !== '') setDialogNotice({ tone: raw.error === true ? 'error' : 'info', text: message })
        if (raw.close === true) {
          window.setTimeout(() => {
            if (!alive.current) return
            setDialogField(null)
            setDialogValues({})
            setDialogNotice(null)
          }, 1_000)
        }
      } catch (error: unknown) {
        if (alive.current) setDialogNotice({ tone: 'error', text: messageOf(error) })
      } finally {
        if (alive.current) setDialogBusy(false)
      }
    })()
  }

  const openDialog = (field: AccountHubFieldDescriptor): void => {
    setDialogField(field)
    setDialogValues({})
    setDialogNotice(null)
  }

  const renderButtonControl = (field: AccountHubFieldDescriptor): ReactNode => (
    <Button
      key={field.key}
      variant={field.tone === 'primary' ? 'primary' : 'outline'}
      size="sm"
      disabled={busy !== null}
      onClick={() => {
        if (field.kind === 'dialog') openDialog(field)
        else runAction(field)
      }}
    >
      {busy === field.key ? (field.busyLabel ?? t('busy')) : field.label}
    </Button>
  )

  const renderField = (field: AccountHubFieldDescriptor): ReactNode => {
    // A note is bare helper copy: no value, no field wrapper.
    if (field.kind === 'note') {
      return <p key={field.key} className={css.hint}>{field.label}</p>
    }
    // Buttons and dialog triggers render bare (no label/field wrapper): they
    // are actions, and the rich and brand layouts place them themselves.
    if (field.kind === 'button' || field.kind === 'dialog') return renderButtonControl(field)
    const domId = `account-hub-${row.id}-${field.key}`
    const control = (): ReactNode => {
      switch (field.kind) {
        case 'text':
          return (
            <Input
              id={domId}
              type="text"
              value={asString(values[field.key])}
              placeholder={field.placeholder}
              onChange={(event) => { setValue(field.key, event.target.value) }}
            />
          )
        case 'password':
          return (
            <Input
              id={domId}
              type="password"
              value={asString(values[field.key])}
              placeholder={field.placeholder}
              autoComplete="off"
              onChange={(event) => { setValue(field.key, event.target.value) }}
            />
          )
        case 'checkbox':
          return (
            <Checkbox
              checked={asBoolean(values[field.key])}
              label={field.label}
              onChange={(next) => { setValue(field.key, next) }}
            />
          )
        case 'select': {
          const choices = [...(field.options ?? []), ...(options[field.key] ?? [])]
          const bound = field.bind !== undefined && editor !== undefined
            ? { path: field.bind, access: editor }
            : undefined
          const current = bound !== undefined
            ? asString(bound.access.getPath([bound.path]))
            : asString(values[field.key])
          return (
            <select
              id={domId}
              className={css.select}
              value={current}
              onChange={(event) => {
                if (bound !== undefined) bound.access.setPath([bound.path], event.target.value)
                else setValue(field.key, event.target.value)
              }}
            >
              {current === '' && <option value="">{t('selectPlaceholder')}</option>}
              {choices.map(choice => (
                <option key={choice.value} value={choice.value}>{choice.label}</option>
              ))}
            </select>
          )
        }
        case 'button':
          return renderButtonControl(field)
      }
    }
    return (
      <div key={field.key} className={css.field}>
        {field.kind !== 'checkbox' && (
          <label className={css.label} htmlFor={domId}>{field.label}</label>
        )}
        {control()}
        {field.description !== undefined && <p className={css.hint}>{field.description}</p>}
      </div>
    )
  }

  // The sign-in modal hoisted above the layout returns: every branch (rich
  // signed-in card, signed-out brand row, plain descriptor card) can carry a
  // dialog trigger, so all three render the same modal.
  const dialogModal = dialogField?.dialog === undefined ? null : (
    <Modal
      open
      onClose={closeDialog}
      title={dialogField.dialog.title ?? dialogField.label}
      closeLabel={t('cancel')}
      footer={(
        <>
          <Button variant="outline" size="sm" disabled={dialogBusy} onClick={closeDialog}>{t('cancel')}</Button>
          <Button variant="primary" size="sm" disabled={dialogBusy} onClick={runDialogSubmit}>
            {dialogBusy
              ? (dialogField.busyLabel ?? t('busy'))
              : (dialogField.dialog.submitLabel ?? dialogField.label)}
          </Button>
        </>
      )}
    >
      {dialogField.dialog.fields.map((input, index) => (
        <div key={input.key} className={css.field}>
          <label className={css.label} htmlFor={`account-hub-dialog-${row.id}-${input.key}`}>{input.label}</label>
          <Input
            id={`account-hub-dialog-${row.id}-${input.key}`}
            type={input.kind}
            value={asString(dialogValues[input.key])}
            placeholder={input.placeholder}
            autoComplete="off"
            data-modal-autofocus={index === 0 ? '' : undefined}
            onChange={(event) => { setDialogValues(previous => ({ ...previous, [input.key]: event.target.value })) }}
          />
        </div>
      ))}
      {dialogNotice !== null && (
        <p className={dialogNotice.tone === 'error' ? css.error : css.notice}>{dialogNotice.text}</p>
      )}
    </Modal>
  )

  // The signed-in account column draws the built-in account layout: an
  // identity card (avatar, name, contact, platform link) and a balance card,
  // both fed by the plugin's state. The plain descriptor form remains the
  // signed-out and models-page rendering.
  const identity = asRecord(status.identity)
  const balance = asRecord(status.balance)
  const showRich = surface !== 'models' && status.signedIn === true
    && (asString(identity.name) !== '' || asString(identity.contact) !== ''
      || asString(identity.avatarUrl) !== '' || asString(identity.infoUrl) !== '')

  if (showRich) {
    const balanceRows = Array.isArray(balance.rows) ? balance.rows : []
    const moreRows = Array.isArray(balance.more) ? balance.more : []
    const buttons = visibleFields.filter(field => field.kind === 'button' || field.kind === 'dialog')
    const rowLink = (raw: JsonValue): ReactNode => {
      const link = asRecord(raw)
      const href = asString(link.href)
      const label = asString(link.label)
      if (href === '' || label === '') return <span className={css.unavailable}>{label}</span>
      return <a className={`${css.unavailable} ${css.unavailableLink}`} href={href} target="_blank" rel="noreferrer">{label}</a>
    }
    return (
      <div className={css.rich}>
        {/* One merged card: identity row on top, balance and more rows below,
          * all separated by hairline dividers. The sign-out action sits to
          * the left of the account-info link with a wider gap. */}
        <div className={css.officialCard}>
          <div className={css.identityRow}>
            <div className={css.identity}>
              <span className={css.avatar}>
                {brandLogo !== ''
                  ? <img className={css.avatarBrand} src={brandLogo} alt="" />
                  : asString(identity.avatarUrl) !== ''
                    ? <img className={css.avatarImage} src={asString(identity.avatarUrl)} alt="" referrerPolicy="no-referrer" />
                    : <IconUserOutlineMedium size={16} />}
              </span>
              <div className={css.identityCopy}>
                <span className={css.nameLine}>{asString(identity.name) !== '' ? asString(identity.name) : t('signedIn')}</span>
                <span className={css.statusLine} role="status">{asString(identity.contact)}</span>
              </div>
            </div>
            <div className={css.rowEnd}>
              {buttons.map(renderButtonControl)}
              {asString(identity.infoUrl) !== '' && (
                <a className={css.accountInfo} href={asString(identity.infoUrl)} target="_blank" rel="noopener noreferrer">
                  {asString(identity.infoLabel) !== '' ? asString(identity.infoLabel) : t('accountInfo')}
                  <IconRightUpOutlineRegular size={12} />
                </a>
              )}
            </div>
          </div>
          {(balanceRows.length > 0 || moreRows.length > 0) && <div className={css.divider} />}
          {balanceRows.map((raw, index) => {
            const r = asRecord(raw)
            return (
              <Fragment key={`balance-${index}`}>
                {index > 0 && <div className={css.divider} />}
                <div className={css.bRow}>
                  <span>{asString(r.label)}</span>
                  {asString(r.value) !== ''
                    ? <span className={css.amount}>{asString(r.value)}</span>
                    : r.loading === true
                      ? <span className={css.unavailable}>{t('loading')}</span>
                      : rowLink(r.unavailable as JsonValue ?? null)}
                </div>
              </Fragment>
            )
          })}
          {moreRows.map((raw, index) => {
            const m = asRecord(raw)
            const links = Array.isArray(m.links) ? m.links : []
            if (links.length === 0) return null
            return (
              <Fragment key={`more-${index}`}>
                <div className={css.divider} />
                <div className={css.bRow}>
                  <span className={css.secondary}>{asString(m.label)}</span>
                  <div className={css.links}>
                    {links.map((rawLink, linkIndex) => {
                      const link = asRecord(rawLink)
                      const href = asString(link.href)
                      const action = asString(link.action)
                      const label = asString(link.label)
                      // An action entry is a plugin operation (fired through
                      // invoke; the state push refreshes the card), not a
                      // navigation — rendered as a plain link-styled button.
                      if (action !== '') {
                        return (
                          <button key={linkIndex}
                            className={link.primary === true ? `${css.linkButton} ${css.primaryLink}` : css.linkButton}
                            onClick={() => {
                              void (async () => {
                                setNotice(null)
                                try { await invoke(action, {}) } catch (error: unknown) {
                                  setNotice({ tone: 'error', text: `${t('actionFailed')}: ${messageOf(error)}` })
                                }
                              })()
                            }}>
                            {label}
                          </button>
                        )
                      }
                      if (href === '') return null
                      return (
                        <a key={linkIndex}
                          className={link.primary === true ? `${css.linkButton} ${css.primaryLink}` : css.linkButton}
                          href={href} target="_blank" rel="noreferrer">
                          {label}
                        </a>
                      )
                    })}
                  </div>
                </div>
              </Fragment>
            )
          })}
        </div>
        {notice !== null && (
          <p className={notice.tone === 'error' ? css.error : css.notice}>{notice.text}</p>
        )}
        {dialogModal}
      </div>
    )
  }

  // The brand row: the plugin's bundled logo and label on the left, its
  // actions (sign-in) on the right — shown while signed out, when the card
  // carries brand facts and nothing but action fields. While a sign-in
  // attempt is in flight the affordance hides and the progress copy shows;
  // a failure reverts here too, with the error copy and the button back.
  // Account-column identity only: the models page renders inside the
  // provider editor, which carries its own title — a brand row there would
  // be a stray second heading, so that surface falls through to the plain
  // field card (and to null when a zone leaves it no fields).
  if (surface !== 'models' && brandLogo !== '' && brandName !== '' && !visibleFields.some(field => isValueField(field))) {
    const signingIn = status.signingIn === true
    const actionFields = signingIn ? [] : visibleFields.filter(field => field.kind === 'button' || field.kind === 'dialog')
    return (
      <div className={css.brandCard}>
        <img className={css.brandMark} src={brandLogo} alt="" />
        <span className={css.brandName}>{brandName}</span>
        {statusText !== '' && (
          <span
            className={[css.brandStatus, statusLevel === 'error' ? css.brandStatusError : undefined].join(' ')}
            role="status"
          >
            {statusText}
          </span>
        )}
        {actionFields.length > 0 && (
          <div className={css.brandActions}>
            {actionFields.map(renderButtonControl)}
          </div>
        )}
        {notice !== null && (
          <p className={notice.tone === 'error' ? css.error : css.notice}>{notice.text}</p>
        )}
        {dialogModal}
      </div>
    )
  }

  // The catalog-zone occurrence renders its fields bare: the catalog block
  // already provides frame, heading, and actions, and the editor's save owns
  // draft-bound controls — no notice, no dialog, no save bar here.
  if (surface === 'models' && zone === 'catalog') {
    if (visibleFields.length === 0) return null
    return <>{visibleFields.map(renderField)}</>
  }

  return (
    // The models-page card renders inside the provider editor, which carries
    // the frame already (title, save controls, layout): the card itself lays
    // flat there. Only the account column keeps the bordered card.
    <div className={surface === 'models' ? css.plain : css.card}>
      {/* The models-page provider card renders inside the provider editor,
        * which carries its own title and save controls: no identity head and
        * no built-in save bar here — draft-bound fields commit with the
        * editor, and only unbound value fields keep the legacy bar. */}
      {surface !== 'models' && (
        <div className={css.head}>
          <span className={css.name}>{row.displayName}</span>
          {statusText !== '' && (
            <span
              className={[css.status, statusLevel === null ? undefined : css[statusLevel]].join(' ')}
            >
              {statusText}
            </span>
          )}
        </div>
      )}
      {visibleFields.map(renderField)}
      {notice !== null && (
        <p className={notice.tone === 'error' ? css.error : css.notice}>{notice.text}</p>
      )}
      {/* A card of actions only (sign-in/out) has nothing to save. */}
      {visibleFields.some(field => isValueField(field) && !isDraftBound(field)) && (
        <div className={css.actions}>
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || busy !== null}
            onClick={() => { save() }}
          >
            {busy === 'save' ? t('saving') : t('save')}
          </Button>
        </div>
      )}
      {dialogModal}
    </div>
  )
}
