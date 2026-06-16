import { useAppStore } from '../store/app-store'
import type { ConnectionState } from '@shared/types'

/** codicon used as the connection-state indicator (coloured via .statusbar__dot--*). */
const STATE_ICON: Record<ConnectionState, string> = {
  connected: 'codicon-circle-filled',
  connecting: 'codicon-loading codicon-modifier-spin',
  error: 'codicon-error',
  disconnected: 'codicon-circle-outline'
}

/** VSCode-style bottom status bar (dark, with a state-coloured connection dot). */
export function StatusBar() {
  const connections = useAppStore((s) => s.connections)
  const statuses = useAppStore((s) => s.statuses)
  const selectedId = useAppStore((s) => s.selectedConnectionId)
  const queues = useAppStore((s) => (selectedId ? s.queuesByConn[selectedId] : undefined)) ?? []

  const conn = connections.find((c) => c.id === selectedId)
  const state: ConnectionState = selectedId
    ? (statuses[selectedId]?.state ?? 'connecting')
    : 'disconnected'
  const totalMessages = queues.reduce((acc, q) => acc + q.messages, 0)

  return (
    <div className="statusbar">
      <span className="statusbar__item statusbar__item--primary">
        <span className={`codicon ${STATE_ICON[state]} statusbar__dot--${state}`} />
        {conn ? `${conn.name} · ${state}` : 'No cluster selected'}
      </span>
      <span className="statusbar__spacer" />
      {selectedId && (
        <>
          <span className="statusbar__item">
            <span className="codicon codicon-list-tree" />
            {queues.length} queues
          </span>
          <span className="statusbar__item">
            <span className="codicon codicon-mail" />
            {totalMessages} messages
          </span>
        </>
      )}
    </div>
  )
}
