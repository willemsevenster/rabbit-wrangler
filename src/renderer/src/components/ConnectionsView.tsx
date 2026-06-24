import { useAppStore, type EditorTab } from '../store/app-store'
import type { ClientConnectionInfo } from '@shared/types'

type ConnectionsTab = Extract<EditorTab, { kind: 'connections' }>

/** Editor tab listing the cluster's live client connections + consumers, with
 * a force-close action (a stuck consumer is a common reason a queue won't drain). */
export function ConnectionsView({ tab }: { tab: ConnectionsTab }) {
  const refreshTab = useAppStore((s) => s.refreshTab)
  const closeClientConnection = useAppStore((s) => s.closeClientConnection)
  const confirm = useAppStore((s) => s.confirm)
  const addToast = useAppStore((s) => s.addToast)

  const { clientConnections, consumers } = tab

  async function onClose(c: ClientConnectionInfo): Promise<void> {
    const ok = await confirm({
      title: 'Force-close connection',
      message: `Force-close connection "${c.name}" (user "${c.user}" from ${c.peer})? Its channels and consumers will be dropped.`,
      confirmLabel: 'Force Close',
      danger: true
    })
    if (!ok) return
    const result = await closeClientConnection(tab.connectionId, c.name)
    if (!result.ok) addToast('error', `Close failed: ${result.error ?? 'unknown error'}`)
  }

  return (
    <div className="editor">
      <div className="editor__header">
        <h2>
          <span className="codicon codicon-plug" />
          {tab.title}
        </h2>
        <span className="spacer" />
        <button className="btn btn--sm btn--secondary" onClick={() => void refreshTab(tab.id)}>
          <span className="codicon codicon-refresh" />
          Refresh
        </button>
      </div>
      <div className="editor__body" style={{ padding: 16, overflow: 'auto' }}>
        <h3 className="section-title">Connections ({clientConnections.length})</h3>
        {clientConnections.length === 0 ? (
          <p className="placeholder" style={{ padding: 0 }}>
            No client connections.
          </p>
        ) : (
          <table className="queue-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>User</th>
                <th>Vhost</th>
                <th>Protocol</th>
                <th className="num">Channels</th>
                <th>State</th>
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {clientConnections.map((c) => (
                <tr key={c.name}>
                  <td title={c.clientName ? `${c.name}\n${c.clientName}` : c.name}>{c.name}</td>
                  <td>{c.user}</td>
                  <td>{c.vhost}</td>
                  <td>
                    {c.protocol}
                    {c.tls && <span className="badge" style={{ marginLeft: 6 }}>TLS</span>}
                  </td>
                  <td className="num">{c.channels}</td>
                  <td>{c.state}</td>
                  <td>
                    <button
                      className="btn btn--sm btn--danger"
                      title="Force-close this connection"
                      onClick={() => void onClose(c)}
                    >
                      Force Close
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 className="section-title" style={{ marginTop: 24 }}>
          Consumers ({consumers.length})
        </h3>
        {consumers.length === 0 ? (
          <p className="placeholder" style={{ padding: 0 }}>
            No consumers on this virtual host.
          </p>
        ) : (
          <table className="queue-table">
            <thead>
              <tr>
                <th>Queue</th>
                <th>Consumer tag</th>
                <th>Connection</th>
                <th>Ack</th>
                <th className="num">Prefetch</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {consumers.map((c, i) => (
                <tr key={`${c.queue}:${c.consumerTag}:${i}`}>
                  <td>{c.queue}</td>
                  <td>
                    <code>{c.consumerTag}</code>
                  </td>
                  <td title={c.connectionName}>{c.connectionName ?? '—'}</td>
                  <td>{c.ackRequired ? 'manual' : 'auto'}</td>
                  <td className="num">{c.prefetchCount || '—'}</td>
                  <td>
                    {c.active ? (
                      'yes'
                    ) : (
                      <span style={{ color: 'var(--warning)' }}>paused</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
