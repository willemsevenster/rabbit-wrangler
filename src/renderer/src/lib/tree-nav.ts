import type {
  ConnectionStatus,
  ExchangeInfo,
  QueueInfo,
  SafeConnectionConfig
} from '@shared/types'

/** A row that is currently visible in the connections tree, in render order. */
export interface TreeNode {
  /** Matches the row's `data-tree-id`. */
  id: string
  kind: 'connection' | 'group' | 'queue' | 'exchange'
  connectionId: string
  /** For group nodes (and to disambiguate which group a leaf belongs to). */
  group?: 'queues' | 'exchanges'
  /** Queue/exchange name (leaf nodes). */
  name?: string
  /** 0 = connection, 1 = group, 2 = item. */
  level: number
  expandable: boolean
  expanded: boolean
}

export const connNodeId = (c: string): string => `conn:${c}`
export const groupNodeId = (c: string, g: 'queues' | 'exchanges'): string => `grp:${c}:${g}`
export const queueNodeId = (c: string, q: string): string => `q:${c}:${q}`
export const exchangeNodeId = (c: string, x: string): string => `x:${c}:${x}`

/** The store slices `flattenVisibleTree` reads (a superset of `getState()`). */
export interface TreeInput {
  connections: SafeConnectionConfig[]
  selectedConnectionId: string | null
  connectionCollapsed: boolean
  queuesCollapsed: boolean
  exchangesCollapsed: boolean
  statuses: Record<string, ConnectionStatus>
  queuesByConn: Record<string, QueueInfo[]>
  exchangesByConn: Record<string, ExchangeInfo[]>
}

/**
 * Flatten the tree to the rows that are actually rendered, in top-to-bottom order
 * — the model the keyboard handler navigates. Only the selected connection shows
 * children, and only when it's connected (otherwise the row is a loading/error
 * placeholder, not a navigable item).
 */
export function flattenVisibleTree(s: TreeInput): TreeNode[] {
  const out: TreeNode[] = []
  for (const c of s.connections) {
    const isSelected = s.selectedConnectionId === c.id
    const connected = s.statuses[c.id]?.state === 'connected'
    const expanded = isSelected && !s.connectionCollapsed && connected
    out.push({
      id: connNodeId(c.id),
      kind: 'connection',
      connectionId: c.id,
      level: 0,
      expandable: true,
      expanded
    })
    if (!expanded) continue

    out.push({
      id: groupNodeId(c.id, 'queues'),
      kind: 'group',
      connectionId: c.id,
      group: 'queues',
      level: 1,
      expandable: true,
      expanded: !s.queuesCollapsed
    })
    if (!s.queuesCollapsed) {
      for (const q of s.queuesByConn[c.id] ?? []) {
        out.push({
          id: queueNodeId(c.id, q.name),
          kind: 'queue',
          connectionId: c.id,
          group: 'queues',
          name: q.name,
          level: 2,
          expandable: false,
          expanded: false
        })
      }
    }

    out.push({
      id: groupNodeId(c.id, 'exchanges'),
      kind: 'group',
      connectionId: c.id,
      group: 'exchanges',
      level: 1,
      expandable: true,
      expanded: !s.exchangesCollapsed
    })
    if (!s.exchangesCollapsed) {
      for (const x of s.exchangesByConn[c.id] ?? []) {
        out.push({
          id: exchangeNodeId(c.id, x.name),
          kind: 'exchange',
          connectionId: c.id,
          group: 'exchanges',
          name: x.name,
          level: 2,
          expandable: false,
          expanded: false
        })
      }
    }
  }
  return out
}

/** Index of the node with `id`, or -1. */
export function indexOfNode(nodes: TreeNode[], id: string | null): number {
  return id == null ? -1 : nodes.findIndex((n) => n.id === id)
}

/** The nearest preceding node one level shallower (the parent), or null. */
export function parentNode(nodes: TreeNode[], index: number): TreeNode | null {
  const node = nodes[index]
  if (!node) return null
  for (let i = index - 1; i >= 0; i--) {
    if (nodes[i].level < node.level) return nodes[i]
  }
  return null
}

/** The next node one level deeper (the first child), or null. */
export function firstChildNode(nodes: TreeNode[], index: number): TreeNode | null {
  const node = nodes[index]
  const next = nodes[index + 1]
  if (node && next && next.level > node.level) return next
  return null
}
