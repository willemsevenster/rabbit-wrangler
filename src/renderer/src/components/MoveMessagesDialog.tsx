import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'
import type { MoveMessageRequest, MoveMessagesRequest } from '@shared/types'

/** Strip a common dead-letter suffix to guess the original queue name. */
const DLQ_SUFFIX = /(\.dlq|\.dead|_dlq|deadletter)$/i

/**
 * Modal to move messages elsewhere. Bulk (drain the queue) when opened without a
 * fingerprint; single-message when opened with one. Defaults to the last
 * destination used for this source queue.
 */
export function MoveMessagesDialog() {
  const dialog = useAppStore((s) => s.moveDialog)
  const sourceQueue = dialog?.queue ?? ''
  const connectionId = dialog?.connectionId ?? null
  const fingerprint = dialog?.fingerprint
  const isSingle = fingerprint != null
  const remembered = useAppStore((s) =>
    connectionId ? s.lastMoveTargets[`${connectionId}:${sourceQueue}`] : undefined
  )
  const close = useAppStore((s) => s.closeMoveDialog)
  const moveMessages = useAppStore((s) => s.moveMessages)
  const moveMessage = useAppStore((s) => s.moveMessage)
  const addToast = useAppStore((s) => s.addToast)

  const [targetExchange, setTargetExchange] = useState(() => remembered?.exchange ?? '')
  const [targetRoutingKey, setTargetRoutingKey] = useState(
    () => remembered?.routingKey ?? sourceQueue.replace(DLQ_SUFFIX, '')
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
    const common = {
      connectionId,
      sourceQueue,
      targetExchange: targetExchange.trim(),
      targetRoutingKey: targetRoutingKey.trim()
    }
    const result = isSingle
      ? await moveMessage({ ...common, fingerprint } as MoveMessageRequest)
      : await moveMessages({
          ...common,
          limit: limit.trim() ? Math.max(1, Math.floor(Number(limit))) : undefined
        } as MoveMessagesRequest)
    if (result.ok) {
      addToast(
        'success',
        isSingle
          ? `Moved 1 message from "${sourceQueue}".`
          : `Moved ${result.affected} message${result.affected === 1 ? '' : 's'} from "${sourceQueue}".`
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
        <div className="modal__header">
          {isSingle ? 'Move message from' : 'Move messages from'} “{sourceQueue}”
        </div>
        <div className="modal__body">
          <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
            {isSingle
              ? 'Republishes this one message to the target (publisher-confirmed), then removes it from the source. '
              : 'Drains the queue’s ready messages and republishes them to the target (publisher-confirmed). '}
            Leave the exchange blank to use the default exchange, which routes by the routing key to
            the queue of that name — handy for returning dead-letters to their original queue.
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
          {!isSingle && (
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
          )}
          {error && <div className="modal__error">{error}</div>}
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={close}>
            Cancel
          </button>
          <button className="btn" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Moving…' : isSingle ? 'Move message' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  )
}
