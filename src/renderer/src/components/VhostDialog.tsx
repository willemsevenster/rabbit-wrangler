import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'
import type { CreateVhostRequest } from '@shared/types'

/** Default queue types a vhost can declare for type-less queue declarations. */
const QUEUE_TYPES = ['', 'classic', 'quorum', 'stream']

/** Create or update a virtual host (`PUT /vhosts/{name}`): name + description +
 * default queue type. On edit the name is read-only (PUT to a new name creates one). */
export function VhostDialog() {
  const dialog = useAppStore((s) => s.vhostDialog)
  const connectionId = dialog?.connectionId ?? null
  const editing = dialog?.editing
  const close = useAppStore((s) => s.closeVhostDialog)
  const createVhost = useAppStore((s) => s.createVhost)

  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [defaultQueueType, setDefaultQueueType] = useState(editing?.defaultQueueType ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const trimmed = name.trim()

  async function submit(): Promise<void> {
    if (!connectionId) return
    if (!trimmed) {
      setError('Provide a virtual host name.')
      return
    }
    setBusy(true)
    setError('')
    const req: CreateVhostRequest = { connectionId, name: trimmed }
    if (description.trim()) req.description = description.trim()
    if (defaultQueueType) req.defaultQueueType = defaultQueueType
    const result = await createVhost(req)
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
        <div className="modal__header">{editing ? 'Edit virtual host' : 'Create virtual host'}</div>
        <div className="modal__body">
          <div className="field">
            <label htmlFor="vhost-name">Name</label>
            <input
              id="vhost-name"
              type="text"
              autoFocus={!editing}
              value={name}
              disabled={!!editing}
              onChange={(e) => setName(e.target.value)}
              placeholder="staging"
            />
          </div>
          <div className="field">
            <label htmlFor="vhost-desc">Description</label>
            <input
              id="vhost-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="(optional)"
            />
          </div>
          <div className="field">
            <label htmlFor="vhost-dqt">Default queue type</label>
            <select
              id="vhost-dqt"
              value={defaultQueueType}
              onChange={(e) => setDefaultQueueType(e.target.value)}
            >
              {QUEUE_TYPES.map((t) => (
                <option key={t || 'default'} value={t}>
                  {t || '(broker default)'}
                </option>
              ))}
            </select>
            <span style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
              Applied to queues declared in this vhost without an explicit type.
            </span>
          </div>
          {error && <div className="modal__error">{error}</div>}
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={close}>
            Cancel
          </button>
          <button className="btn" onClick={() => void submit()} disabled={busy || !trimmed}>
            {busy ? 'Saving…' : editing ? 'Save virtual host' : 'Create virtual host'}
          </button>
        </div>
      </div>
    </div>
  )
}
