import { useAppStore } from '../store/app-store'
import { effectiveConnectionState, type EffectiveConnectionState } from '../lib/connection-health'
import type { ConnectionState } from '@shared/types'

/** codicon used as the connection-state indicator (coloured via .statusbar__dot--*). */
const STATE_ICON: Record<EffectiveConnectionState, string> = {
  connected: 'codicon-circle-filled',
  degraded: 'codicon-warning',
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

  const cluster = useAppStore((s) => (selectedId ? s.clusterByConn[selectedId] : undefined))

  const conn = connections.find((c) => c.id === selectedId)
  const rawState: ConnectionState = selectedId
    ? (statuses[selectedId]?.state ?? 'connecting')
    : 'disconnected'
  const state = effectiveConnectionState(rawState, cluster)
  const totalMessages = queues.reduce((acc, q) => acc + q.messages, 0)
  const memAlarm = cluster?.nodes.some((n) => n.memAlarm) ?? false
  const diskAlarm = cluster?.nodes.some((n) => n.diskFreeAlarm) ?? false
  const alarmLabel =
    memAlarm && diskAlarm
      ? 'memory & disk alarm'
      : memAlarm
        ? 'memory alarm'
        : diskAlarm
          ? 'disk alarm'
          : null

  return (
    <div className="statusbar">
      <span className="statusbar__item statusbar__item--primary">
        <span className={`codicon ${STATE_ICON[state]} statusbar__dot--${state}`} />
        {conn ? `${conn.name} · ${state}` : 'No cluster selected'}
      </span>
      {alarmLabel && (
        <span className="statusbar__item statusbar__item--alarm" title="A broker node has tripped a resource alarm; publishers are blocked.">
          <span className="codicon codicon-warning" />
          {alarmLabel}
        </span>
      )}
      <span className="statusbar__spacer" />
      {selectedId && (
        <>
          {cluster && (
            <span className="statusbar__item" title="Broker version">
              <span className="codicon codicon-server" />
              RabbitMQ {cluster.overview.rabbitmqVersion}
            </span>
          )}
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
