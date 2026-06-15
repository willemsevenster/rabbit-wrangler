import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'
import type { MoveMessagesRequest } from '@shared/types'

/** Strip a common dead-letter suffix to guess the original queue name. */
const DLQ_SUFFIX = /(\.dlq|\.dead|_dlq|deadletter)$/i

/** Modal to drain a queue's ready messages and republish them elsewhere. */
export function MoveMessagesDialog() {
  const sourceQueue = useAppStore((s) => s.moveDialogQueue) ?? ''
  const connectionId = useAppStore((s) => s.selectedConnectionId)
  const close = useAppStore((s) => s.closeMoveDialog)
  const move = useAppStore((s) => s.moveMessages)

  const [targetExchange, setTargetExchange] = useState('')
  const [targetRoutingKey, setTargetRoutingKey] = useState(() =>
    sourceQueue.replace(DLQ_SUFFIX, '')
  )
  const [limit, setLimit] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  async function submit() {
    if (!connectionId) return
    if (!targetExchange.trim() && !targetRoutingKey.trim()) {
      setError('Provide a target exchange or routing key.')
      return
    }
    setBusy(true)
    setError('')
    const req: MoveMessagesRequest = {
      connectionId,
      sourceQueue,
      targetExchange: targetExchange.trim(),
      targetRoutingKey: targetRoutingKey.trim(),
      limit: limit.trim() ? Math.max(1, Math.floor(Number(limit))) : undefined
    }
    const result = await move(req)
    if (result.ok) {
      alert(
        `Moved ${result.affected} message${result.affected === 1 ? '' : 's'} from "${sourceQueue}".`
      )
    } else {
      setError(result.error ?? 'Move failed.')
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
        <div className="modal__header">Move messages from “{sourceQueue}”</div>
        <div className="modal__body">
          <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
            Drains the queue&rsquo;s ready messages and republishes them to the target (publisher-
            confirmed). Leave the exchange blank to use the default exchange, which routes by the
            routing key to the queue of that name — handy for returning dead-letters to their
            original queue.
          </p>
          <div className="field">
            <label>Target Exchange</label>
            <input
              id="move-exchange"
              type="text"
              value={targetExchange}
              onChange={(e) => setTargetExchange(e.target.value)}
              placeholder="(default exchange)"
            />
          </div>
          <div className="field">
            <label>Target Routing Key</label>
            <input
              id="move-rk"
              type="text"
              value={targetRoutingKey}
              autoFocus
              onChange={(e) => setTargetRoutingKey(e.target.value)}
              placeholder="original queue name"
            />
          </div>
          <div className="field">
            <label>Limit (optional — blank moves all)</label>
            <input
              id="move-limit"
              type="number"
              min={1}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="all"
            />
          </div>
          {error && <div className="modal__error">{error}</div>}
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={close}>
            Cancel
          </button>
          <button className="btn" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Moving…' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  )
}
