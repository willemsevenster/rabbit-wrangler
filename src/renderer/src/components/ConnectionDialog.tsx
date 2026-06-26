import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'
import type { BrowseMode, ConnectionConfig } from '@shared/types'

/** Modal form for creating (or editing) a RabbitMQ connection. */
export function ConnectionDialog() {
  const editing = useAppStore((s) => s.editing)
  const close = useAppStore((s) => s.closeDialog)
  const save = useAppStore((s) => s.saveConnection)

  const [name, setName] = useState(editing?.name ?? '')
  const [host, setHost] = useState(editing?.host ?? 'localhost')
  const [amqpPort, setAmqpPort] = useState(editing?.amqpPort ?? 5672)
  const [managementPort, setManagementPort] = useState(editing?.managementPort ?? 15672)
  const [vhost, setVhost] = useState(editing?.vhost ?? '/')
  const [username, setUsername] = useState(editing?.username ?? 'guest')
  const [password, setPassword] = useState('')
  const [tls, setTls] = useState(editing?.tls ?? false)
  const [browseMode, setBrowseMode] = useState<BrowseMode>(editing?.browseMode ?? 'auto')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  async function submit() {
    if (!name.trim() || !host.trim()) {
      setError('Name and host are required.')
      return
    }
    setSaving(true)
    setError('')
    const config: ConnectionConfig = {
      id: editing?.id ?? crypto.randomUUID(),
      name: name.trim(),
      host: host.trim(),
      amqpPort,
      managementPort,
      vhost,
      username,
      password,
      tls,
      browseMode
    }
    try {
      await save(config)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
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
        <div className="modal__header">{editing ? 'Edit Connection' : 'Add Connection'}</div>
        <div className="modal__body">
          <div className="field">
            <label>Name</label>
            <input
              id="conn-name"
              type="text"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder="Production cluster"
            />
          </div>
          <div className="field">
            <label>Host</label>
            <input
              id="conn-host"
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="rabbit.example.com"
            />
          </div>
          <div className="field field--row">
            <div className="field">
              <label>AMQP Port</label>
              <input
                id="conn-amqp-port"
                type="number"
                value={amqpPort}
                onChange={(e) => setAmqpPort(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Management Port</label>
              <input
                id="conn-mgmt-port"
                type="number"
                value={managementPort}
                onChange={(e) => setManagementPort(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="field">
            <label>Virtual Host</label>
            <input
              id="conn-vhost"
              type="text"
              value={vhost}
              onChange={(e) => setVhost(e.target.value)}
            />
          </div>
          <div className="field field--row">
            <div className="field">
              <label>Username</label>
              <input
                id="conn-user"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                id="conn-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editing ? '•••••• (unchanged — type to replace)' : ''}
              />
            </div>
          </div>
          <div className="field--check">
            <input id="tls" type="checkbox" checked={tls} onChange={(e) => setTls(e.target.checked)} />
            <label htmlFor="tls">Use TLS (amqps / https)</label>
          </div>
          <div className="field">
            <label htmlFor="conn-browse-mode">Message browsing</label>
            <select
              id="conn-browse-mode"
              value={browseMode}
              onChange={(e) => setBrowseMode(e.target.value as BrowseMode)}
            >
              <option value="auto">Auto — use AMQP when available (full move / delete)</option>
              <option value="http">HTTP browse only — read-only, no AMQP port needed</option>
            </select>
            <span style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
              HTTP browse works when the AMQP port (5672) is firewalled. It’s read-only — moving and
              deleting messages need AMQP. If the AMQP port is unreachable, HTTP browse is used
              automatically.
            </span>
          </div>
          {error && <div className="modal__error">{error}</div>}
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={close}>
            Cancel
          </button>
          <button className="btn" onClick={() => void submit()} disabled={saving}>
            {editing ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
