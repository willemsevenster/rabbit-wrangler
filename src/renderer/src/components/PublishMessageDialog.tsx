import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'
import { HelpPopover } from './HelpPopover'
import type { PublishMessageRequest } from '@shared/types'

type HeaderType = 'String' | 'Number' | 'Boolean' | 'List'
interface HeaderRow {
  key: string
  value: string
  type: HeaderType
}
interface PropRow {
  key: string
  value: string
}

/** Property values RabbitMQ expects as numbers rather than strings. */
const NUMERIC_PROPS = new Set(['priority', 'timestamp'])

/** Settable AMQP properties suggested for the Properties key (delivery mode + headers are pulled out). */
const VALID_PROPERTY_NAMES = [
  'content_type',
  'content_encoding',
  'priority',
  'correlation_id',
  'reply_to',
  'expiration',
  'message_id',
  'timestamp',
  'type',
  'user_id',
  'app_id',
  'cluster_id'
]

const HEADERS_HINT = 'Headers can have any name. Only long string headers can be set here.'

const PROPERTY_HINT =
  'Set other message properties here (delivery mode and headers are pulled out as the most ' +
  'common cases). Invalid properties are ignored.\n\nValid properties: content_type, ' +
  'content_encoding, priority, correlation_id, reply_to, expiration, message_id, timestamp, ' +
  'type, user_id, app_id, cluster_id'

function coerceHeader(value: string, type: HeaderType): unknown {
  if (type === 'Number') return value === '' ? 0 : Number(value)
  if (type === 'Boolean') return value.trim().toLowerCase() === 'true'
  if (type === 'List') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
  }
  return value
}

/** Modal to publish a message to the selected exchange (mirrors the RabbitMQ form). */
export function PublishMessageDialog() {
  const dialog = useAppStore((s) => s.publishDialog)
  const exchange = dialog?.exchange ?? ''
  const connectionId = dialog?.connectionId ?? null
  const queues = useAppStore((s) => (connectionId ? s.queuesByConn[connectionId] : undefined)) ?? []
  const close = useAppStore((s) => s.closePublishDialog)
  const publish = useAppStore((s) => s.publishMessage)

  const [routingKey, setRoutingKey] = useState('')
  const [deliveryMode, setDeliveryMode] = useState(1)
  const [headers, setHeaders] = useState<HeaderRow[]>([])
  const [properties, setProperties] = useState<PropRow[]>([])
  const [payload, setPayload] = useState('')
  const [encoding, setEncoding] = useState<'string' | 'base64'>('string')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const label = exchange === '' ? '(AMQP default)' : exchange

  // Property suggestions: valid names not already used in a row.
  const usedProps = new Set(properties.map((p) => p.key.trim()).filter(Boolean))
  const propSuggestions = VALID_PROPERTY_NAMES.filter((n) => !usedProps.has(n))

  function addHeader() {
    setHeaders((h) => [...h, { key: '', value: '', type: 'String' }])
  }
  function updateHeader(i: number, patch: Partial<HeaderRow>) {
    setHeaders((h) => h.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function removeHeader(i: number) {
    setHeaders((h) => h.filter((_r, idx) => idx !== i))
  }
  function addProp() {
    setProperties((p) => [...p, { key: '', value: '' }])
  }
  function updateProp(i: number, patch: Partial<PropRow>) {
    setProperties((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function removeProp(i: number) {
    setProperties((p) => p.filter((_r, idx) => idx !== i))
  }

  async function submit() {
    if (!connectionId) return
    setBusy(true)
    setError('')

    const headersObj: Record<string, unknown> = {}
    for (const h of headers) {
      if (h.key.trim()) headersObj[h.key.trim()] = coerceHeader(h.value, h.type)
    }

    const propsObj: Record<string, unknown> = { delivery_mode: deliveryMode }
    for (const p of properties) {
      const key = p.key.trim()
      if (!key) continue
      propsObj[key] = NUMERIC_PROPS.has(key) && p.value !== '' ? Number(p.value) : p.value
    }

    const req: PublishMessageRequest = {
      connectionId,
      exchange,
      routingKey: routingKey.trim(),
      payload,
      payloadEncoding: encoding,
      headers: headersObj,
      properties: propsObj
    }
    const result = await publish(req)
    if (result.ok) {
      alert(
        result.affected > 0
          ? 'Message published and routed.'
          : 'Message published, but it was not routed to any queue.'
      )
    } else {
      setError(result.error ?? 'Publish failed.')
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
      <div className="modal modal--wide">
        <div className="modal__header">Publish to “{label}”</div>
        <div className="modal__body">
          <div className="field">
            <label>Routing key</label>
            <input
              id="pub-rk"
              type="text"
              list="pub-rk-list"
              autoFocus
              value={routingKey}
              onChange={(e) => setRoutingKey(e.target.value)}
              placeholder={exchange === '' ? 'target queue name' : 'routing key'}
            />
            <datalist id="pub-rk-list">
              {queues.map((q) => (
                <option key={q.name} value={q.name} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label>Delivery mode</label>
            <select
              id="pub-delivery-mode"
              className="pub-input"
              value={deliveryMode}
              onChange={(e) => setDeliveryMode(Number(e.target.value))}
            >
              <option value={1}>1 - Non-persistent</option>
              <option value={2}>2 - Persistent</option>
            </select>
          </div>

          <div className="field">
            <div className="field__heading">
              Headers
              <HelpPopover text={HEADERS_HINT} />
              <button
                id="add-header"
                className="icon-button"
                title="Add header"
                style={{ marginLeft: 'auto' }}
                onClick={addHeader}
              >
                <span className="codicon codicon-add" />
              </button>
            </div>
            {headers.map((h, i) => (
              <div className="pub-row" key={i}>
                <input
                  className="pub-input pub-row__key"
                  placeholder="header"
                  value={h.key}
                  onChange={(e) => updateHeader(i, { key: e.target.value })}
                />
                <span className="pub-row__eq">=</span>
                <input
                  className="pub-input pub-row__value"
                  placeholder="value"
                  value={h.value}
                  onChange={(e) => updateHeader(i, { value: e.target.value })}
                />
                <select
                  className="pub-input pub-row__type"
                  value={h.type}
                  onChange={(e) => updateHeader(i, { type: e.target.value as HeaderType })}
                >
                  <option value="String">String</option>
                  <option value="Number">Number</option>
                  <option value="Boolean">Boolean</option>
                  <option value="List">List</option>
                </select>
                <button className="icon-button" title="Remove" onClick={() => removeHeader(i)}>
                  <span className="codicon codicon-close" />
                </button>
              </div>
            ))}
          </div>

          <div className="field">
            <div className="field__heading">
              Properties
              <HelpPopover text={PROPERTY_HINT} />
              <button
                id="add-prop"
                className="icon-button"
                title="Add property"
                style={{ marginLeft: 'auto' }}
                onClick={addProp}
              >
                <span className="codicon codicon-add" />
              </button>
            </div>
            {properties.map((p, i) => (
              <div className="pub-row" key={i}>
                <input
                  className="pub-input pub-row__key"
                  list="pub-prop-list"
                  placeholder="property"
                  value={p.key}
                  onChange={(e) => updateProp(i, { key: e.target.value })}
                />
                <span className="pub-row__eq">=</span>
                <input
                  className="pub-input pub-row__value"
                  placeholder="value"
                  value={p.value}
                  onChange={(e) => updateProp(i, { value: e.target.value })}
                />
                <button className="icon-button" title="Remove" onClick={() => removeProp(i)}>
                  <span className="codicon codicon-close" />
                </button>
              </div>
            ))}
            <datalist id="pub-prop-list">
              {propSuggestions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label>Payload</label>
            <textarea
              id="pub-payload"
              rows={8}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              placeholder='{"hello":"world"}'
            />
          </div>

          <div className="field">
            <label>Payload encoding</label>
            <select
              id="pub-encoding"
              className="pub-input"
              value={encoding}
              onChange={(e) => setEncoding(e.target.value as 'string' | 'base64')}
            >
              <option value="string">String (default)</option>
              <option value="base64">Base64</option>
            </select>
          </div>

          {error && <div className="modal__error">{error}</div>}
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={close}>
            Cancel
          </button>
          <button className="btn" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Publishing…' : 'Publish message'}
          </button>
        </div>
      </div>
    </div>
  )
}
