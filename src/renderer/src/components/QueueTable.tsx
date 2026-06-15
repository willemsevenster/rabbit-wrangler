import { useAppStore } from '../store/app-store'
import { ContextMenu, useContextMenu } from './ContextMenu'
import { buildQueueMenu } from '../lib/queue-menu'

/** Queue overview shown in the editor when a connection (but no queue) is selected. */
export function QueueTable() {
  const queues = useAppStore((s) => s.queues)
  const selectQueue = useAppStore((s) => s.selectQueue)
  const { menu, openMenu, close } = useContextMenu()

  return (
    <>
      <table className="queue-table">
        <thead>
          <tr>
            <th>Name</th>
            <th className="num">Ready</th>
            <th className="num">Unacked</th>
            <th className="num">Consumers</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {queues.map((q) => (
            <tr
              key={q.name}
              data-queue-row={q.name}
              onClick={() => selectQueue(q.name)}
              onContextMenu={(e) => openMenu(e, buildQueueMenu(q))}
            >
              <td>
                <span
                  className="codicon codicon-inbox"
                  style={{ marginRight: 6, color: q.isDeadLetter ? 'var(--warning)' : 'var(--text-muted)' }}
                />
                {q.name}
                {q.isDeadLetter && (
                  <span className="badge badge--dlq" style={{ marginLeft: 6 }}>
                    DLQ
                  </span>
                )}
              </td>
              <td className="num">{q.messagesReady}</td>
              <td className="num">{q.messagesUnacknowledged}</td>
              <td className="num">{q.consumers}</td>
              <td>{q.state}</td>
            </tr>
          ))}
          {queues.length === 0 && (
            <tr>
              <td colSpan={5} style={{ color: 'var(--text-muted)', padding: 12 }}>
                No queues on this virtual host.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {menu && <ContextMenu {...menu} onClose={close} />}
    </>
  )
}
