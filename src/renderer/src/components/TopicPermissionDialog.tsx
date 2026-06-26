import { useEffect, useState } from 'react'
import { useAppStore, adminTabId, type EditorTab } from '../store/app-store'
import type { SetTopicPermissionRequest } from '@shared/types'

/** Set a user's topic (write/read) permissions for an exchange on a vhost
 * (`PUT /topic-permissions/{vhost}/{user}`). */
export function TopicPermissionDialog() {
  const dialog = useAppStore((s) => s.topicPermissionDialog)
  const connectionId = dialog?.connectionId ?? null
  const editing = dialog?.editing
  const close = useAppStore((s) => s.closeTopicPermissionDialog)
  const setTopicPermission = useAppStore((s) => s.setTopicPermission)
  const adminTab = useAppStore((s) => {
    const t = s.tabs.find((x) => x.id === (connectionId ? adminTabId(connectionId) : ''))
    return (t?.kind === 'admin' ? t : null) as Extract<EditorTab, { kind: 'admin' }> | null
  })
  const users = adminTab?.users ?? []
  const vhosts = adminTab?.vhosts ?? []

  const [user, setUser] = useState(editing?.user ?? users[0]?.name ?? '')
  const [vhost, setVhost] = useState(editing?.vhost ?? vhosts[0]?.name ?? '')
  const [exchange, setExchange] = useState(editing?.exchange ?? '')
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

  async function submit(): Promise<void> {
    if (!connectionId) return
    if (!user || !vhost) {
      setError('Pick a user and virtual host.')
      return
    }
    if (!exchange.trim()) {
      setError('Provide the topic exchange name.')
      return
    }
    setBusy(true)
    setError('')
    const req: SetTopicPermissionRequest = {
      connectionId,
      user,
      vhost,
      exchange: exchange.trim(),
      write,
      read
    }
    const result = await setTopicPermission(req)
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
        <div className="modal__header">
          {editing ? 'Edit topic permissions' : 'Set topic permissions'}
        </div>
        <div className="modal__body">
          <div className="field field--row">
            <div className="field">
              <label htmlFor="topic-user">User</label>
              <select
                id="topic-user"
                value={user}
                disabled={!!editing}
                onChange={(e) => setUser(e.target.value)}
              >
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
              <label htmlFor="topic-vhost">Virtual host</label>
              <select
                id="topic-vhost"
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
            <label htmlFor="topic-exchange">Topic exchange</label>
            <input
              id="topic-exchange"
              type="text"
              value={exchange}
              disabled={!!editing}
              onChange={(e) => setExchange(e.target.value)}
              placeholder="amq.topic"
            />
          </div>
          <div className="field">
            <label htmlFor="topic-write">Write (routing-key regex)</label>
            <input
              id="topic-write"
              type="text"
              value={write}
              onChange={(e) => setWrite(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="topic-read">Read (routing-key regex)</label>
            <input
              id="topic-read"
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
          <button
            className="btn"
            onClick={() => void submit()}
            disabled={busy || !user || !vhost || !exchange.trim()}
          >
            {busy ? 'Saving…' : 'Save topic permissions'}
          </button>
        </div>
      </div>
    </div>
  )
}
