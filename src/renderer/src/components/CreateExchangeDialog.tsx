import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'
import { HelpPopover } from './HelpPopover'
import type { CreateExchangeRequest } from '@shared/types'

type ArgType = 'String' | 'Number' | 'Boolean'
interface ArgRow {
  key: string
  value: string
  type: ArgType
}

const EXCHANGE_TYPES = ['direct', 'fanout', 'topic', 'headers']

/** Common exchange x-arguments, suggested in the key field's datalist. */
const COMMON_ARGS = ['alternate-exchange']

const ARGS_HINT =
  'Optional exchange arguments (x-args). The most common is alternate-exchange (string) — ' +
  'where unroutable messages are sent.'

function coerceArg(value: string, type: ArgType): unknown {
  if (type === 'Number') return value === '' ? 0 : Number(value)
  if (type === 'Boolean') return value.trim().toLowerCase() === 'true'
  return value
}

/** Modal to declare a new exchange (or idempotently re-assert an identical one). */
export function CreateExchangeDialog() {
  const dialog = useAppStore((s) => s.createExchangeDialog)
  const connectionId = dialog?.connectionId ?? null
  const exchanges =
    useAppStore((s) => (connectionId ? s.exchangesByConn[connectionId] : undefined)) ?? []
  const close = useAppStore((s) => s.closeCreateExchangeDialog)
  const createExchange = useAppStore((s) => s.createExchange)
  const openExchangeTab = useAppStore((s) => s.openExchangeTab)
  const addToast = useAppStore((s) => s.addToast)

  const [name, setName] = useState('')
  const [type, setType] = useState('direct')
  const [durable, setDurable] = useState(true)
  const [autoDelete, setAutoDelete] = useState(false)
  const [internal, setInternal] = useState(false)
  const [args, setArgs] = useState<ArgRow[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const trimmed = name.trim()
  const exists = exchanges.some((x) => x.name === trimmed)
  const reserved = trimmed.startsWith('amq.')
  const warn = reserved
    ? 'Names starting with “amq.” are reserved — the broker will reject this.'
    : exists
      ? 'An exchange with this name already exists. Creating with different settings will fail.'
      : ''

  function addArg() {
    setArgs((a) => [...a, { key: '', value: '', type: 'String' }])
  }
  function updateArg(i: number, patch: Partial<ArgRow>) {
    setArgs((a) => a.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function removeArg(i: number) {
    setArgs((a) => a.filter((_r, idx) => idx !== i))
  }

  async function submit() {
    if (!connectionId) return
    if (!trimmed) {
      setError('Provide an exchange name.')
      return
    }
    setBusy(true)
    setError('')

    const argsObj: Record<string, unknown> = {}
    for (const a of args) {
      const key = a.key.trim()
      if (key) argsObj[key] = coerceArg(a.value, a.type)
    }

    const req: CreateExchangeRequest = {
      connectionId,
      name: trimmed,
      type,
      durable,
      autoDelete,
      internal,
      arguments: argsObj
    }
    const result = await createExchange(req)
    if (result.ok) {
      addToast('success', `Created exchange “${trimmed}”.`)
      void openExchangeTab(connectionId, trimmed)
    } else {
      setError(result.error ?? 'Create failed.')
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
        <div className="modal__header">Create exchange</div>
        <div className="modal__body">
          <div className="field">
            <label htmlFor="create-exchange-name">Name</label>
            <input
              id="create-exchange-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="orders.routing"
            />
            {warn && (
              <span style={{ color: 'var(--warning)', fontSize: 12, marginTop: 4 }}>{warn}</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="create-exchange-type">Type</label>
            <select
              id="create-exchange-type"
              className="pub-input"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {EXCHANGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <label className="field--check">
            <input type="checkbox" checked={durable} onChange={(e) => setDurable(e.target.checked)} />
            Durable (survives a broker restart)
          </label>

          <label className="field--check">
            <input
              type="checkbox"
              checked={autoDelete}
              onChange={(e) => setAutoDelete(e.target.checked)}
            />
            Auto-delete (when the last binding is removed)
          </label>

          <label className="field--check">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
            />
            Internal (cannot be published to directly)
          </label>

          <div className="field">
            <div className="field__heading">
              Arguments
              <HelpPopover text={ARGS_HINT} />
              <button
                id="create-exchange-add-arg"
                className="icon-button"
                title="Add argument"
                style={{ marginLeft: 'auto' }}
                onClick={addArg}
              >
                <span className="codicon codicon-add" />
              </button>
            </div>
            {args.map((a, i) => (
              <div className="pub-row" key={i}>
                <input
                  className="pub-input pub-row__key"
                  list="create-exchange-arg-list"
                  placeholder="argument"
                  value={a.key}
                  onChange={(e) => updateArg(i, { key: e.target.value })}
                />
                <span className="pub-row__eq">=</span>
                <input
                  className="pub-input pub-row__value"
                  placeholder="value"
                  value={a.value}
                  onChange={(e) => updateArg(i, { value: e.target.value })}
                />
                <select
                  className="pub-input pub-row__type"
                  value={a.type}
                  onChange={(e) => updateArg(i, { type: e.target.value as ArgType })}
                >
                  <option value="String">String</option>
                  <option value="Number">Number</option>
                  <option value="Boolean">Boolean</option>
                </select>
                <button className="icon-button" title="Remove" onClick={() => removeArg(i)}>
                  <span className="codicon codicon-close" />
                </button>
              </div>
            ))}
            <datalist id="create-exchange-arg-list">
              {COMMON_ARGS.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          {error && <div className="modal__error">{error}</div>}
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={close}>
            Cancel
          </button>
          <button className="btn" onClick={() => void submit()} disabled={busy || !trimmed}>
            {busy ? 'Creating…' : 'Create exchange'}
          </button>
        </div>
      </div>
    </div>
  )
}
