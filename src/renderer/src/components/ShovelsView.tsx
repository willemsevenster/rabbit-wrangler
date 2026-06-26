import { useAppStore, type EditorTab } from '../store/app-store'
import type { ShovelInfo } from '@shared/types'

type ShovelsTab = Extract<EditorTab, { kind: 'shovels' }>

/** Editor tab listing a vhost's dynamic shovels and their state, with delete.
 * Shovels created here are one-shot DLQ/backlog drains that run broker-side and
 * delete themselves when done — so an empty list after a move is expected. */
export function ShovelsView({ tab }: { tab: ShovelsTab }) {
  const refreshTab = useAppStore((s) => s.refreshTab)
  const deleteShovel = useAppStore((s) => s.deleteShovel)
  const maybeConfirm = useAppStore((s) => s.maybeConfirm)

  const { support, shovels } = tab

  async function onDelete(s: ShovelInfo): Promise<void> {
    const ok = await maybeConfirm({
      title: 'Delete shovel',
      message: `Delete shovel "${s.name}"? Any in-progress move stops; messages already moved stay moved.`,
      confirmLabel: 'Delete',
      danger: true
    })
    if (!ok) return
    await deleteShovel(tab.connectionId, s.name)
  }

  return (
    <div className="editor">
      <div className="editor__header">
        <h2>
          <span className="codicon codicon-arrow-swap" />
          {tab.title}
        </h2>
        <span className="spacer" />
        <button className="btn btn--sm btn--secondary" onClick={() => void refreshTab(tab.id)}>
          <span className="codicon codicon-refresh" />
          Refresh
        </button>
      </div>
      <div className="editor__body" style={{ padding: 16, overflow: 'auto' }}>
        {support == null ? (
          <p className="placeholder" style={{ padding: 0 }}>
            Checking shovel support…
          </p>
        ) : !support.supported ? (
          <div className="shovel-unsupported">
            <p>
              <span className="codicon codicon-warning" /> Server-side shovels aren’t available on
              this broker.
            </p>
            <p style={{ color: 'var(--text-muted)' }}>{support.reason}</p>
          </div>
        ) : (
          <>
            <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
              Dynamic shovels move messages broker-side. The ones started here are <b>one-shot</b> —
              they drain the queue’s current backlog, then delete themselves, so an empty list after
              a move is normal.
            </p>
            {shovels.length === 0 ? (
              <p className="placeholder" style={{ padding: 0 }}>
                No active shovels on this virtual host.
              </p>
            ) : (
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>State</th>
                    <th>Source</th>
                    <th>Destination</th>
                    <th style={{ width: 1 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {shovels.map((s) => (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td>
                        <span className={`shovel-state shovel-state--${s.state}`}>{s.state}</span>
                      </td>
                      <td className="msg-table__muted">{s.source ?? '—'}</td>
                      <td className="msg-table__muted">{s.destination ?? '—'}</td>
                      <td className="policy-actions">
                        <button
                          className="icon-button"
                          title="Delete shovel"
                          onClick={() => void onDelete(s)}
                        >
                          <span className="codicon codicon-trash" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  )
}
