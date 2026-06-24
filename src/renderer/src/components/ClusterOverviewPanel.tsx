import { useAppStore } from '../store/app-store'
import { formatBytes, formatRate } from '../lib/message-format'
import type { NodeInfo } from '@shared/types'

/** Compact "12.3 GB" / "—" for an optional byte count. */
function bytes(n: number | undefined): string {
  return n == null ? '—' : formatBytes(n)
}

/** Human uptime from milliseconds: "3d 4h", "5h 12m", "8m". */
function formatUptime(ms: number | undefined): string {
  if (ms == null) return '—'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function NodeCard({ node }: { node: NodeInfo }) {
  return (
    <div className="node-card">
      <div className="node-card__head">
        <span
          className={`codicon ${node.running ? 'codicon-vm-running' : 'codicon-vm-outline'}`}
          style={{ color: node.running ? 'var(--success)' : 'var(--text-muted)' }}
        />
        <span className="node-card__name" title={node.name}>
          {node.name}
        </span>
        {node.memAlarm && <span className="badge badge--alarm">memory alarm</span>}
        {node.diskFreeAlarm && <span className="badge badge--alarm">disk alarm</span>}
      </div>
      <div className="node-card__stats">
        <span>
          Mem <strong>{bytes(node.memUsed)}</strong>
          {node.memLimit != null && <span className="muted"> / {bytes(node.memLimit)}</span>}
        </span>
        <span>
          Disk free <strong>{bytes(node.diskFree)}</strong>
          {node.diskFreeLimit != null && (
            <span className="muted"> (min {bytes(node.diskFreeLimit)})</span>
          )}
        </span>
        <span>
          FD{' '}
          <strong>
            {node.fdUsed ?? '—'}
            {node.fdTotal != null && <span className="muted"> / {node.fdTotal}</span>}
          </strong>
        </span>
        <span>
          Uptime <strong>{formatUptime(node.uptime)}</strong>
        </span>
      </div>
    </div>
  )
}

/** Cluster summary + node health shown at the top of a connection's Overview tab. */
export function ClusterOverviewPanel({ connectionId }: { connectionId: string }) {
  const cluster = useAppStore((s) => s.clusterByConn[connectionId])
  if (!cluster) {
    return <div className="cluster-panel cluster-panel--empty">Loading cluster info…</div>
  }

  const { overview, nodes } = cluster
  const hasAlarm = nodes.some((n) => n.memAlarm || n.diskFreeAlarm)
  const t = overview.totals
  const r = overview.rates

  return (
    <div className="cluster-panel">
      {hasAlarm && (
        <div className="cluster-panel__alarm">
          <span className="codicon codicon-warning" />
          Resource alarm active — the broker has blocked publishers (queues may sit in “flow”).
        </div>
      )}
      <div className="cluster-panel__grid">
        <div className="stat">
          <span className="stat__label">Version</span>
          <span className="stat__value">{overview.rabbitmqVersion}</span>
        </div>
        {overview.clusterName && (
          <div className="stat">
            <span className="stat__label">Cluster</span>
            <span className="stat__value" title={overview.clusterName}>
              {overview.clusterName}
            </span>
          </div>
        )}
        <div className="stat">
          <span className="stat__label">Queues</span>
          <span className="stat__value">{t.queues}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Connections</span>
          <span className="stat__value">{t.connections}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Channels</span>
          <span className="stat__value">{t.channels}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Consumers</span>
          <span className="stat__value">{t.consumers}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Publish</span>
          <span className="stat__value">{formatRate(r.publish)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Deliver</span>
          <span className="stat__value">{formatRate(r.deliver)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Ack</span>
          <span className="stat__value">{formatRate(r.ack)}</span>
        </div>
      </div>
      {nodes.length > 0 ? (
        <div className="cluster-panel__nodes">
          {nodes.map((n) => (
            <NodeCard key={n.name} node={n} />
          ))}
        </div>
      ) : (
        <div className="cluster-panel__note">
          Node health (memory / disk alarms) is unavailable — most often the broker user lacks the{' '}
          <strong>monitoring</strong> tag, or the broker didn’t return node data.
        </div>
      )}
    </div>
  )
}
