import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'
import type { DeleteQueueRequest } from '@shared/types'

/**
 * Modal to delete a whole queue (and its messages). Shows the live message /
 * consumer counts and offers the broker's if-empty / if-unused safety guards;
 * a guard rejection is shown inline so the user can adjust and retry.
 */
export function DeleteQueueDialog() {
  const dialog = useAppStore((s) => s.deleteQueueDialog)
  const queue = dialog?.queue ?? ''
  const connectionId = dialog?.connectionId ?? null
  const info = useAppStore((s) =>
    connectionId ? s.queuesByConn[connectionId]?.find((q) => q.name === queue) : undefined
  )
  const close = useAppStore((s) => s.closeDeleteQueueDialog)
  const deleteQueue = useAppStore((s) => s.deleteQueue)
  const addToast = useAppStore((s) => s.addToast)

  const [ifEmpty, setIfEmpty] = useState(false)
  const [ifUnused, setIfUnused] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const messages = info?.messages ?? 0
  const consumers = info?.consumers ?? 0

  async function submit() {
    if (!connectionId) return
    setBusy(true)
    setError('')
    const req: DeleteQueueRequest = { connectionId, name: queue, ifEmpty, ifUnused }
    const result = await deleteQueue(req)
    if (result.ok) {
      addToast(
        'success',
        result.affected > 0
          ? `Deleted queue “${queue}” (${result.affected} message${result.affected === 1 ? '' : 's'} discarded).`
          : `Deleted queue “${queue}”.`
      )
    } else {
      setError(result.error ?? 'Delete failed.')
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
        <div className="modal__header">Delete queue “{queue}”</div>
        <div className="modal__body">
          <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
            Deletes the entire queue and any messages it holds. This cannot be undone. To only empty
            the queue, use <strong>Purge</strong> instead.
          </p>
          <p style={{ marginTop: 0, fontSize: 13 }}>
            This queue currently holds{' '}
            <strong>
              {messages} message{messages === 1 ? '' : 's'}
            </strong>{' '}
            and has{' '}
            <strong>
              {consumers} consumer{consumers === 1 ? '' : 's'}
            </strong>
            .
          </p>
          <label className="field--check">
            <input
              type="checkbox"
              checked={ifEmpty}
              onChange={(e) => setIfEmpty(e.target.checked)}
            />
            Only delete if empty{messages > 0 ? ` (currently ${messages})` : ''}
          </label>
          <label className="field--check">
            <input
              type="checkbox"
              checked={ifUnused}
              onChange={(e) => setIfUnused(e.target.checked)}
            />
            Only delete if unused{consumers > 0 ? ` (currently ${consumers} consumer(s))` : ''}
          </label>
          {error && <div className="modal__error">{error}</div>}
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={close}>
            Cancel
          </button>
          <button className="btn btn--danger" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete queue'}
          </button>
        </div>
      </div>
    </div>
  )
}
