/** 官方 DeepSeek 账号卡片：由 hub 绘制，数据来自官方 remote.account。 */
import { useState, type ReactNode } from 'react'
import { Button, IconUserOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { OfficialAccountSnapshot } from './index.ts'

export interface OfficialDeepSeekCardProps {
  snapshot: OfficialAccountSnapshot
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const card: React.CSSProperties = {
  border: '1px solid var(--dsh-border, #ddd)', borderRadius: 10, padding: '12px 14px',
  display: 'flex', flexDirection: 'column', gap: 8,
}
const head: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 }
const avatar: React.CSSProperties = {
  width: 32, height: 32, borderRadius: '50%', background: 'rgba(127,127,127,0.15)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flex: '0 0 auto',
}
const name: React.CSSProperties = { fontSize: 14, fontWeight: 600 }
const status: React.CSSProperties = { fontSize: 12, opacity: 0.7 }
const actions: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }
const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }
const divider: React.CSSProperties = { height: 1, background: 'var(--dsh-border, rgba(127,127,127,0.2))', margin: '2px 0' }
const error: React.CSSProperties = { color: 'var(--dsw-alias-state-error-primary, #c0392b)', fontSize: 12 }

export function OfficialDeepSeekCard({ snapshot, signIn, signOut }: OfficialDeepSeekCardProps): ReactNode {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const run = (action: () => Promise<void>): void => {
    setBusy(true); setFailure('')
    void action().catch((cause: unknown) => {
      setFailure(cause instanceof Error ? cause.message : String(cause))
    }).finally(() => { setBusy(false) })
  }
  return (
    <div style={card}>
      <div style={head}>
        <span style={avatar}>
          {snapshot.avatarUrl !== undefined && snapshot.avatarUrl !== ''
            ? <img src={snapshot.avatarUrl} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy='no-referrer' />
            : <IconUserOutlineMedium size={16} />}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2, minWidth: 0 }}>
          <span style={name}>{snapshot.signedIn ? snapshot.name : 'DeepSeek 账号'}</span>
          <span style={status}>{snapshot.text}{snapshot.contact !== '' && snapshot.signedIn ? ` · ${snapshot.contact}` : ''}</span>
        </div>
      </div>
      {snapshot.signedIn && snapshot.rows.length > 0 && (
        <>
          <div style={divider} />
          {snapshot.rows.map(item => (
            <div key={item.label} style={row}><span>{item.label}</span><span>{item.value}</span></div>
          ))}
        </>
      )}
      {failure !== '' && <p style={error}>{failure}</p>}
      <div style={actions}>
        {snapshot.signedIn
          ? <Button variant='outline' size='sm' disabled={busy} onClick={() => run(signOut)}>{busy ? '退出中…' : '退出登录'}</Button>
          : <Button variant='primary' size='sm' disabled={busy} onClick={() => run(signIn)}>{busy ? '等待浏览器授权…' : '登录'}</Button>}
      </div>
    </div>
  )
}
