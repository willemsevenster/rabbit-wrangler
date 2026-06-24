import type { ClusterOverview, ConnectionState, NodeInfo } from '@shared/types'

/** Connection state as shown in the UI — the contract states plus a derived
 * `degraded`: reachable, but a broker node has tripped a resource alarm. */
export type EffectiveConnectionState = ConnectionState | 'degraded'

/**
 * Fold live cluster health into the connection state. A connection that is
 * `connected` but whose cluster has any node memory/disk alarm is shown as
 * `degraded` (publishers are blocked → queues sit in `flow`). When node data is
 * unavailable (no monitoring tag) we can't tell, so it stays `connected`.
 */
export function effectiveConnectionState(
  state: ConnectionState,
  cluster: { overview: ClusterOverview; nodes: NodeInfo[] } | undefined
): EffectiveConnectionState {
  if (state !== 'connected' || !cluster) return state
  const alarm = cluster.nodes.some((n) => n.memAlarm || n.diskFreeAlarm)
  return alarm ? 'degraded' : 'connected'
}
