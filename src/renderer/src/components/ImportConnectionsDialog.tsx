import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store/app-store'
import type { ConnectionConfig } from '@shared/types'

type Action = 'new' | 'overwrite' | 'skip'

/** First free `${base} (n)` not already taken. */
function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let n = 1
  while (taken.has(`${base} (${n})`)) n++
  return `${base} (${n})`
}

/**
 * Dialog shown after picking an import file. Lists the incoming connections, lets
 * the user set a password per row, and — for any whose name collides with an
 * existing connection — choose Skip / Overwrite / Import as new (suffixed `(n)`).
 */
export function ImportConnectionsDialog() {
  const candidates = useAppStore((s) => s.importDialog)
  const existing = useAppStore((s) => s.connections)
  const close = useAppStore((s) => s.closeImport)
  const refresh = useAppStore((s) => s.refreshConnections)
  const addToast = useAppStore((s) => s.addToast)

  const list = useMemo(() => candidates ?? [], [candidates])
  const existingNames = useMemo(() => new Set(existing.map((c) => c.name)), [existing])

  const [passwords, setPasswords] = useState<string[]>(() => list.map(() => ''))
  const [actions, setActions] = useState<Action[]>(() => list.map(() => 'new'))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  if (!candidates) return null

  const conflicts = list.filter((c) => existingNames.has(c.name)).length

  async function doImport(): Promise<void> {
    setBusy(true)
    const taken = new Set(existingNames)
    let imported = 0
    for (let i = 0; i < list.length; i++) {
      const cand = list[i]
      const conflict = existingNames.has(cand.name)
      const action: Action = conflict ? actions[i] : 'new'
      if (action === 'skip') continue
      const password = passwords[i] ?? ''
      if (action === 'overwrite') {
        const match = existing.find((c) => c.name === cand.name)
        const config: ConnectionConfig = { ...cand, id: match?.id ?? crypto.randomUUID(), password }
        await window.api.saveConnection(config)
      } else {
        const name = uniqueName(cand.name, taken)
        taken.add(name)
        const config: ConnectionConfig = { ...cand, id: crypto.randomUUID(), name, password }
        await window.api.saveConnection(config)
      }
      imported++
    }
    await refresh()
    addToast('success', `Imported ${imported} connection${imported === 1 ? '' : 's'}.`)
    setBusy(false)
    close()
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="modal modal--wide">
        <div className="modal__header">Import Connections</div>
        <div className="modal__body">
          <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
            {list.length} connection{list.length === 1 ? '' : 's'} found
            {conflicts > 0 && ` · ${conflicts} name${conflicts === 1 ? '' : 's'} already exist`}.
            Passwords aren’t included in exports — set them here (or leave blank and edit later).
          </p>
          <div className="import-list">
            {list.map((cand, i) => {
              const conflict = existingNames.has(cand.name)
              const skipped = conflict && actions[i] === 'skip'
              return (
                <div className="import-row" key={i}>
                  <div className="import-row__main">
                    <div className="import-row__name">
                      {cand.name}
                      {conflict && <span className="badge badge--dlq">exists</span>}
                    </div>
                    <div className="import-row__sub">
                      {cand.host}:{cand.amqpPort} · {cand.username}@{cand.vhost}
                      {cand.tls && ' · TLS'}
                    </div>
                  </div>
                  {conflict && (
                    <select
                      className="pub-input import-row__action"
                      value={actions[i]}
                      onChange={(e) =>
                        setActions((a) => a.map((v, j) => (j === i ? (e.target.value as Action) : v)))
                      }
                    >
                      <option value="new">Import as new</option>
                      <option value="overwrite">Overwrite</option>
                      <option value="skip">Skip</option>
                    </select>
                  )}
                  <input
                    className="pub-input import-row__pass"
                    type="password"
                    placeholder="password (optional)"
                    value={passwords[i]}
                    disabled={skipped}
                    onChange={(e) =>
                      setPasswords((p) => p.map((v, j) => (j === i ? e.target.value : v)))
                    }
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={close}>
            Cancel
          </button>
          <button className="btn" onClick={() => void doImport()} disabled={busy}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
