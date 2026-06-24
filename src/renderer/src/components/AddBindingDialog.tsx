import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'
import { HelpPopover } from './HelpPopover'
import type { CreateBindingRequest } from '@shared/types'

type ArgType = 'String' | 'Number' | 'Boolean'
interface ArgRow {
  key: string
  value: string
  type: ArgType
}

const ARGS_HINT =
  'For a headers exchange, add x-match (String: "all" or "any") plus the header names/values to ' +
  'match on. Ignored by direct/fanout/topic exchanges, which route by routing key.'

function coerceArg(value: string, type: ArgType): unknown {
  if (type === 'Number') return value === '' ? 0 : Number(value)
  if (type === 'Boolean') return value.trim().toLowerCase() === 'true'
  return value
}

/** Modal to bind a source exchange to a queue or another exchange. */
export function AddBindingDialog() {
  const dialog = useAppStore((s) => s.bindingDialog)
  const source = dialog?.source ?? ''
  const connectionId = dialog?.connectionId ?? null
  const queues = useAppStore((s) => (connectionId ? s.queuesByConn[connectionId] : undefined)) ?? []
  const exchanges =
    useAppStore((s) => (connectionId ? s.exchangesByConn[connectionId] : undefined)) ?? []
  const close = useAppStore((s) => s.closeBindingDialog)
  const createBinding = useAppStore((s) => s.createBinding)
  const addToast = useAppStore((s) => s.addToast)

  const [destinationType, setDestinationType] = useState<'queue' | 'exchange'>('queue')
  const [destination, setDestination] = useState('')
  const [routingKey, setRoutingKey] = useState('')
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

  // Destination suggestions for the chosen type (exclude the source itself).
  const options =
    destinationType === 'queue'
      ? queues.map((q) => q.name)
      : exchanges.map((x) => x.name).filter((n) => n !== '' && n !== source)

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
    const dest = destination.trim()
    if (!dest) {
      setError(`Provide a destination ${destinationType}.`)
      return
    }
    setBusy(true)
    setError('')

    const argsObj: Record<string, unknown> = {}
    for (const a of args) {
      const key = a.key.trim()
      if (key) argsObj[key] = coerceArg(a.value, a.type)
    }

    const req: CreateBindingRequest = {
      connectionId,
      source,
      destination: dest,
      destinationType,
      routingKey: routingKey.trim(),
      arguments: argsObj
    }
    const result = await createBinding(req)
    if (result.ok) {
      addToast('success', `Bound “${source}” → ${destinationType} “${dest}”.`)
    } else {
      setError(result.error ?? 'Bind failed.')
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
        <div className="modal__header">Add binding from “{source}”</div>
        <div className="modal__body">
          <div className="field">
            <label>Destination type</label>
            <div className="radio-row">
              <label className="field--check" style={{ marginTop: 0 }}>
                <input
                  type="radio"
                  name="binding-dest-type"
                  checked={destinationType === 'queue'}
                  onChange={() => setDestinationType('queue')}
                />
                Queue
              </label>
              <label className="field--check" style={{ marginTop: 0 }}>
                <input
                  type="radio"
                  name="binding-dest-type"
                  checked={destinationType === 'exchange'}
                  onChange={() => setDestinationType('exchange')}
                />
                Exchange
              </label>
            </div>
          </div>

          <div className="field">
            <label htmlFor="binding-dest">Destination {destinationType}</label>
            <input
              id="binding-dest"
              type="text"
              list="binding-dest-list"
              autoFocus
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={destinationType === 'queue' ? 'queue name' : 'exchange name'}
            />
            <datalist id="binding-dest-list">
              {options.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label htmlFor="binding-rk">Routing key</label>
            <input
              id="binding-rk"
              type="text"
              value={routingKey}
              onChange={(e) => setRoutingKey(e.target.value)}
              placeholder="routing key (optional for fanout / headers)"
            />
          </div>

          <div className="field">
            <div className="field__heading">
              Arguments
              <HelpPopover text={ARGS_HINT} />
              <button
                id="binding-add-arg"
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
          </div>

          {error && <div className="modal__error">{error}</div>}
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={close}>
            Cancel
          </button>
          <button className="btn" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Binding…' : 'Add binding'}
          </button>
        </div>
      </div>
    </div>
  )
}
