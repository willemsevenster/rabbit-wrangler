import { useAppStore } from '../store/app-store'
import { ContextMenu, useContextMenu } from './ContextMenu'
import { buildQueueMenu } from '../lib/queue-menu'
import { isDeadLetterQueue } from '../lib/dlq'
import { formatBytes, formatRate } from '../lib/message-format'

/** Net queue-depth rate, signed (`+12/s` incoming, `-3/s` draining). */
function depthRate(n: number | undefined): string {
  if (n == null) return '—'
  return (n > 0 ? '+' : '') + formatRate(n)
}

/** Queue overview for a connection, shown inside its overview tab. */
export function QueueTable({ connectionId }: { connectionId: string }) {
  const queues = useAppStore((s) => s.queuesByConn[connectionId]) ?? []
  const openQueueTab = useAppStore((s) => s.openQueueTab)
  const dlqSuffixes = useAppStore((s) => s.dlqSuffixes)
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
            <th className="num">Rate</th>
            <th className="num">Memory</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {queues.map((q) => {
            const isDeadLetter = isDeadLetterQueue(q.name, dlqSuffixes)
            return (
            <tr
              key={q.name}
              data-queue-row={q.name}
              onClick={() => openQueueTab(connectionId, q.name)}
              onContextMenu={(e) => openMenu(e, buildQueueMenu(connectionId, q))}
            >
              <td>
                <span
                  className="codicon codicon-inbox"
                  style={{ marginRight: 6, color: isDeadLetter ? 'var(--warning)' : 'var(--text-muted)' }}
                />
                {q.name}
                {isDeadLetter && (
                  <span className="badge badge--dlq" style={{ marginLeft: 6 }}>
                    DLQ
                  </span>
                )}
              </td>
              <td className="num">{q.messagesReady}</td>
              <td className="num">{q.messagesUnacknowledged}</td>
              <td className="num">{q.consumers}</td>
              <td className="num">{depthRate(q.messageRate)}</td>
              <td className="num">{q.memory != null ? formatBytes(q.memory) : '—'}</td>
              <td>{q.state}</td>
            </tr>
            )
          })}
          {queues.length === 0 && (
            <tr>
              <td colSpan={7} style={{ color: 'var(--text-muted)', padding: 12 }}>
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
