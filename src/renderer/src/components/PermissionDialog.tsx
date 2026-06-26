import { useEffect, useState } from 'react'
import { useAppStore, adminTabId, type EditorTab } from '../store/app-store'
import type { SetPermissionRequest } from '@shared/types'

/** Set a user's configure/write/read permissions on a vhost
 * (`PUT /permissions/{vhost}/{user}`). User + vhost come from the admin tab's
 * lists; on edit they're fixed and only the regexes change. */
export function PermissionDialog() {
  const dialog = useAppStore((s) => s.permissionDialog)
  const connectionId = dialog?.connectionId ?? null
  const editing = dialog?.editing
  const close = useAppStore((s) => s.closePermissionDialog)
  const setPermission = useAppStore((s) => s.setPermission)
  const adminTab = useAppStore((s) => {
    const t = s.tabs.find((x) => x.id === (connectionId ? adminTabId(connectionId) : ''))
    return (t?.kind === 'admin' ? t : null) as Extract<EditorTab, { kind: 'admin' }> | null
  })
  const users = adminTab?.users ?? []
  const vhosts = adminTab?.vhosts ?? []

  const [user, setUser] = useState(editing?.user ?? users[0]?.name ?? '')
  const [vhost, setVhost] = useState(editing?.vhost ?? vhosts[0]?.name ?? '')
  const [configure, setConfigure] = useState(editing?.configure ?? '.*')
  const [write, setWrite] = useState(editing?.write ?? '.*')
  const [read, setRead] = useState(editing?.read ?? '.*')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  function setAll(v: string): void {
    setConfigure(v)
    setWrite(v)
    setRead(v)
  }

  async function submit(): Promise<void> {
    if (!connectionId) return
    if (!user) {
      setError('Pick a user.')
      return
    }
    if (!vhost) {
      setError('Pick a virtual host.')
      return
    }
    setBusy(true)
    setError('')
    const req: SetPermissionRequest = { connectionId, user, vhost, configure, write, read }
    const result = await setPermission(req)
    if (!result.ok) {
      setError(result.error ?? 'Save failed.')
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="modal">
        <div className="modal__header">{editing ? 'Edit permissions' : 'Set permissions'}</div>
        <div className="modal__body">
          <div className="field field--row">
            <div className="field">
              <label htmlFor="perm-user">User</label>
              <select
                id="perm-user"
                value={user}
                disabled={!!editing}
                onChange={(e) => setUser(e.target.value)}
              >
                {!editing && users.length === 0 && <option value="">(no users)</option>}
                {editing && !users.some((u) => u.name === user) && (
                  <option value={user}>{user}</option>
                )}
                {users.map((u) => (
                  <option key={u.name} value={u.name}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="perm-vhost">Virtual host</label>
              <select
                id="perm-vhost"
                value={vhost}
                disabled={!!editing}
                onChange={(e) => setVhost(e.target.value)}
              >
                {editing && !vhosts.some((v) => v.name === vhost) && (
                  <option value={vhost}>{vhost}</option>
                )}
                {vhosts.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <div className="field__heading">
              Permissions (regex — <code>.*</code> = all, blank = none)
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button className="btn btn--sm btn--secondary" onClick={() => setAll('.*')}>
                  Full
                </button>
                <button className="btn btn--sm btn--secondary" onClick={() => setAll('')}>
                  None
                </button>
              </span>
            </div>
            <label htmlFor="perm-configure">Configure</label>
            <input
              id="perm-configure"
              type="text"
              value={configure}
              onChange={(e) => setConfigure(e.target.value)}
            />
            <label htmlFor="perm-write">Write</label>
            <input
              id="perm-write"
              type="text"
              value={write}
              onChange={(e) => setWrite(e.target.value)}
            />
            <label htmlFor="perm-read">Read</label>
            <input
              id="perm-read"
              type="text"
              value={read}
              onChange={(e) => setRead(e.target.value)}
            />
          </div>

          {error && <div className="modal__error">{error}</div>}
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={close}>
            Cancel
          </button>
          <button className="btn" onClick={() => void submit()} disabled={busy || !user || !vhost}>
            {busy ? 'Saving…' : 'Save permissions'}
          </button>
        </div>
      </div>
    </div>
  )
}
