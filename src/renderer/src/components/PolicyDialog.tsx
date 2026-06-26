import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'
import { HelpPopover } from './HelpPopover'
import type { CreatePolicyRequest } from '@shared/types'

type ArgType = 'String' | 'Number' | 'Boolean'
interface DefRow {
  key: string
  value: string
  type: ArgType
}

/** Common policy definition keys, suggested in the key field's datalist. */
const COMMON_KEYS = [
  'message-ttl',
  'max-length',
  'max-length-bytes',
  'dead-letter-exchange',
  'dead-letter-routing-key',
  'expires',
  'overflow',
  'queue-mode',
  'max-age',
  'delivery-limit',
  'alternate-exchange',
  'ha-mode',
  'ha-params',
  'ha-sync-mode'
]

const DEF_HINT =
  'The policy definition. Common keys: message-ttl (Number, ms), max-length / ' +
  'max-length-bytes (Number), dead-letter-exchange / dead-letter-routing-key (String), ' +
  'expires (Number, ms), overflow (String). Choose the right value type.'

function coerce(value: string, type: ArgType): unknown {
  if (type === 'Number') return value === '' ? 0 : Number(value)
  if (type === 'Boolean') return value.trim().toLowerCase() === 'true'
  return value
}

/** Build editable rows from an existing policy definition, inferring each type. */
function rowsFrom(def: Record<string, unknown>): DefRow[] {
  return Object.entries(def).map(([key, v]) => {
    if (typeof v === 'number') return { key, value: String(v), type: 'Number' }
    if (typeof v === 'boolean') return { key, value: String(v), type: 'Boolean' }
    return { key, value: typeof v === 'object' ? JSON.stringify(v) : String(v), type: 'String' }
  })
}

/** Create or edit a policy (PUT /policies/{vhost}/{name}). */
export function PolicyDialog() {
  const dialog = useAppStore((s) => s.policyDialog)
  const connectionId = dialog?.connectionId ?? null
  const editing = dialog?.editing
  const close = useAppStore((s) => s.closePolicyDialog)
  const createPolicy = useAppStore((s) => s.createPolicy)

  const [name, setName] = useState(editing?.name ?? '')
  const [pattern, setPattern] = useState(editing?.pattern ?? '')
  const [applyTo, setApplyTo] = useState(editing?.applyTo ?? 'all')
  const [priority, setPriority] = useState(String(editing?.priority ?? 0))
  const [rows, setRows] = useState<DefRow[]>(editing ? rowsFrom(editing.definition) : [])
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

  function addRow() {
    setRows((r) => [...r, { key: '', value: '', type: 'String' }])
  }
  function updateRow(i: number, patch: Partial<DefRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_row, idx) => idx !== i))
  }

  async function submit() {
    if (!connectionId) return
    if (!trimmed) {
      setError('Provide a policy name.')
      return
    }
    if (!pattern.trim()) {
      setError('Provide a pattern (regex matched against names).')
      return
    }
    const definition: Record<string, unknown> = {}
    for (const row of rows) {
      const key = row.key.trim()
      if (key) definition[key] = coerce(row.value, row.type)
    }
    if (Object.keys(definition).length === 0) {
      setError('Add at least one definition entry (e.g. message-ttl).')
      return
    }
    setBusy(true)
    setError('')
    const req: CreatePolicyRequest = {
      connectionId,
      name: trimmed,
      pattern: pattern.trim(),
      applyTo,
      definition,
      priority: Math.floor(Number(priority)) || 0
    }
    const result = await createPolicy(req)
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
      <div className="modal modal--wide">
        <div className="modal__header">{editing ? 'Edit policy' : 'Create policy'}</div>
        <div className="modal__body">
          <div className="field">
            <label htmlFor="policy-name">Name</label>
            <input
              id="policy-name"
              type="text"
              autoFocus
              value={name}
              disabled={!!editing}
              onChange={(e) => setName(e.target.value)}
              placeholder="ttl-on-orders"
            />
            {editing && (
              <span style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                Name can’t be changed — delete and re-create to rename.
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="policy-pattern">Pattern</label>
            <input
              id="policy-pattern"
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="^orders\\."
            />
          </div>

          <div className="field field--row">
            <label htmlFor="policy-apply-to">Apply to</label>
            <select
              id="policy-apply-to"
              className="pub-input"
              value={applyTo}
              onChange={(e) => setApplyTo(e.target.value)}
            >
              <option value="all">all</option>
              <option value="queues">queues</option>
              <option value="exchanges">exchanges</option>
            </select>
          </div>

          <div className="field field--row">
            <label htmlFor="policy-priority">Priority</label>
            <input
              id="policy-priority"
              type="number"
              className="pub-input"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </div>

          <div className="field">
            <div className="field__heading">
              Definition
              <HelpPopover text={DEF_HINT} />
              <button
                id="policy-add-def"
                className="icon-button"
                title="Add definition entry"
                style={{ marginLeft: 'auto' }}
                onClick={addRow}
              >
                <span className="codicon codicon-add" />
              </button>
            </div>
            {rows.map((row, i) => (
              <div className="pub-row" key={i}>
                <input
                  className="pub-input pub-row__key"
                  list="policy-def-list"
                  placeholder="key"
                  value={row.key}
                  onChange={(e) => updateRow(i, { key: e.target.value })}
                />
                <span className="pub-row__eq">=</span>
                <input
                  className="pub-input pub-row__value"
                  placeholder="value"
                  value={row.value}
                  onChange={(e) => updateRow(i, { value: e.target.value })}
                />
                <select
                  className="pub-input pub-row__type"
                  value={row.type}
                  onChange={(e) => updateRow(i, { type: e.target.value as ArgType })}
                >
                  <option value="String">String</option>
                  <option value="Number">Number</option>
                  <option value="Boolean">Boolean</option>
                </select>
                <button className="icon-button" title="Remove" onClick={() => removeRow(i)}>
                  <span className="codicon codicon-close" />
                </button>
              </div>
            ))}
            <datalist id="policy-def-list">
              {COMMON_KEYS.map((k) => (
                <option key={k} value={k} />
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
            {busy ? 'Saving…' : editing ? 'Save policy' : 'Create policy'}
          </button>
        </div>
      </div>
    </div>
  )
}
