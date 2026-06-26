import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'
import type { CreateShovelRequest, ShovelSupport } from '@shared/types'

/** Strip a common dead-letter suffix to guess the original queue name. */
const DLQ_SUFFIX = /(\.dlq|\.dead|_dlq|deadletter)$/i

/**
 * Create a one-shot dynamic shovel to drain a (large) queue broker-side, instead
 * of pulling every message through the app. Probes shovel support on open and, if
 * the plugins aren't enabled, shows how to turn them on rather than failing later.
 */
export function ShovelDialog() {
  const dialog = useAppStore((s) => s.shovelDialog)
  const connectionId = dialog?.connectionId ?? null
  const srcQueue = dialog?.queue ?? ''
  const close = useAppStore((s) => s.closeShovelDialog)
  const createShovel = useAppStore((s) => s.createShovel)

  const [support, setSupport] = useState<ShovelSupport | null>(null)
  const [name, setName] = useState(() => `rw-move-${srcQueue.replace(/[^\w.-]+/g, '_')}`)
  const [destExchange, setDestExchange] = useState('')
  const [destRoutingKey, setDestRoutingKey] = useState(() => srcQueue.replace(DLQ_SUFFIX, ''))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // Probe shovel support when the dialog opens.
  useEffect(() => {
    if (!connectionId) return
    let alive = true
    void window.api
      .getShovelSupport(connectionId)
      .then((s) => alive && setSupport(s))
      .catch(() => alive && setSupport({ supported: false, reason: 'Could not check shovel support.' }))
    return () => {
      alive = false
    }
  }, [connectionId])

  const supported = support?.supported === true
  const trimmedName = name.trim()

  async function submit(): Promise<void> {
    if (!connectionId || !supported) return
    if (!trimmedName) {
      setError('Provide a name for the shovel.')
      return
    }
    if (!destRoutingKey.trim()) {
      // Required in every case: it's the destination queue name on the default
      // exchange, and the routing key on a named one.
      setError('Provide a destination routing key (the target queue name when no exchange is set).')
      return
    }
    setBusy(true)
    setError('')
    const req: CreateShovelRequest = {
      connectionId,
      name: trimmedName,
      srcQueue,
      destExchange: destExchange.trim(),
      destRoutingKey: destRoutingKey.trim()
    }
    const result = await createShovel(req)
    if (!result.ok) {
      setError(result.error ?? 'Could not create the shovel.')
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
        <div className="modal__header">Server-side move from “{srcQueue}”</div>
        <div className="modal__body">
          <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
            Creates a one-shot <b>dynamic shovel</b> that drains this queue’s backlog{' '}
            <b>on the broker</b> (not through the app) and deletes itself when done — ideal for very
            large dead-letter queues. Acks are publisher-confirmed, so a failure can duplicate but
            never drop. Leave the exchange blank to route by key to the queue of that name.
          </p>

          {support == null ? (
            <p className="placeholder" style={{ padding: 0 }}>
              Checking shovel support…
            </p>
          ) : !supported ? (
            <div className="shovel-unsupported">
              <p>
                <span className="codicon codicon-warning" /> Server-side shovels aren’t available on
                this broker.
              </p>
              <p style={{ color: 'var(--text-muted)' }}>{support.reason}</p>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="shovel-name">Shovel name</label>
                <input
                  id="shovel-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="shovel-exchange">Destination exchange</label>
                <input
                  id="shovel-exchange"
                  type="text"
                  value={destExchange}
                  onChange={(e) => setDestExchange(e.target.value)}
                  placeholder="(default exchange)"
                />
              </div>
              <div className="field">
                <label htmlFor="shovel-rk">Destination routing key</label>
                <input
                  id="shovel-rk"
                  type="text"
                  value={destRoutingKey}
                  autoFocus
                  onChange={(e) => setDestRoutingKey(e.target.value)}
                  placeholder="original queue name"
                />
              </div>
            </>
          )}

          {error && <div className="modal__error">{error}</div>}
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={close}>
            {supported ? 'Cancel' : 'Close'}
          </button>
          {supported && (
            <button className="btn" onClick={() => void submit()} disabled={busy || !trimmedName}>
              {busy ? 'Starting…' : 'Start shovel'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
