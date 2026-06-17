import {
  createContext,
  useContext,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode
} from 'react'
import { useAppStore, overviewTabId, queueTabId, exchangeTabId } from '../store/app-store'
import { ContextMenu, useContextMenu, type MenuItem } from './ContextMenu'
import { buildQueueMenu } from '../lib/queue-menu'
import { buildExchangeMenu } from '../lib/exchange-menu'
import { buildGroupMenu } from '../lib/group-menu'
import { isDeadLetterQueue } from '../lib/dlq'
import {
  connNodeId,
  groupNodeId,
  queueNodeId,
  exchangeNodeId,
  flattenVisibleTree,
  indexOfNode,
  parentNode,
  firstChildNode,
  type TreeNode
} from '../lib/tree-nav'
import type { ExchangeInfo, QueueInfo, SafeConnectionConfig } from '@shared/types'

type OpenMenu = (e: MouseEvent, items: MenuItem[]) => void

/** Roving-tabindex focus state shared by every tree row. */
const TreeFocusContext = createContext<{
  focusedId: string | null
  setFocusedId: (id: string) => void
}>({ focusedId: null, setFocusedId: () => {} })
const useTreeFocus = (): { focusedId: string | null; setFocusedId: (id: string) => void } =>
  useContext(TreeFocusContext)

/** VSCode-style explorer: the Connections tree plus its toolbar. Keyboard-navigable
 * (WAI-ARIA tree): Up/Down move focus, Left/Right collapse/expand or move
 * parent/child, Enter/Space activates. */
export function SideBar() {
  const connections = useAppStore((s) => s.connections)
  const selectedConnectionId = useAppStore((s) => s.selectedConnectionId)
  const connectionCollapsed = useAppStore((s) => s.connectionCollapsed)
  const queuesCollapsed = useAppStore((s) => s.queuesCollapsed)
  const exchangesCollapsed = useAppStore((s) => s.exchangesCollapsed)
  const statuses = useAppStore((s) => s.statuses)
  const queuesByConn = useAppStore((s) => s.queuesByConn)
  const exchangesByConn = useAppStore((s) => s.exchangesByConn)
  const openNew = useAppStore((s) => s.openNewConnection)
  const refresh = useAppStore((s) => s.refreshConnections)
  const collapseTree = useAppStore((s) => s.collapseTree)
  const { menu, openMenu, close } = useContextMenu()

  const treeRef = useRef<HTMLDivElement>(null)
  const [focusedId, setFocusedIdState] = useState<string | null>(null)
  const focusedIdRef = useRef<string | null>(null)
  const setFocusedId = (id: string): void => {
    focusedIdRef.current = id
    setFocusedIdState(id)
  }

  // One row is always tabbable (roving) so Tab/F6 can land on the tree. Validate
  // the focused id against what's actually visible — collapsing a group or
  // switching connections can leave `focusedId` pointing at a now-unrendered row.
  const visible = flattenVisibleTree({
    connections,
    selectedConnectionId,
    connectionCollapsed,
    queuesCollapsed,
    exchangesCollapsed,
    statuses,
    queuesByConn,
    exchangesByConn
  })
  const isVisible = (id: string | null): boolean => id != null && visible.some((n) => n.id === id)
  const selectedConnNode = selectedConnectionId ? connNodeId(selectedConnectionId) : null
  const fallbackId = (isVisible(selectedConnNode) ? selectedConnNode : null) ?? visible[0]?.id ?? null
  const effectiveFocusedId = isVisible(focusedId) ? focusedId : fallbackId

  function focusRow(id: string): void {
    setFocusedId(id)
    treeRef.current
      ?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(id)}"]`)
      ?.focus()
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>): void {
    const handled = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ']
    if (!handled.includes(e.key)) return
    // Only navigate when a tree row itself has focus (not an action button inside it).
    if (!(e.target instanceof HTMLElement) || !e.target.hasAttribute('data-tree-id')) return

    const s = useAppStore.getState()
    const nodes = flattenVisibleTree(s)
    if (nodes.length === 0) return
    let idx = indexOfNode(nodes, focusedIdRef.current ?? fallbackId)
    if (idx === -1) idx = 0
    const node = nodes[idx]
    e.preventDefault()

    switch (e.key) {
      case 'ArrowDown':
        if (idx < nodes.length - 1) focusRow(nodes[idx + 1].id)
        break
      case 'ArrowUp':
        if (idx > 0) focusRow(nodes[idx - 1].id)
        break
      case 'Home':
        focusRow(nodes[0].id)
        break
      case 'End':
        focusRow(nodes[nodes.length - 1].id)
        break
      case 'ArrowRight':
        if (node.expandable && !node.expanded) expandNode(node)
        else if (node.expandable && node.expanded) {
          const child = firstChildNode(nodes, idx)
          if (child) focusRow(child.id)
        }
        break
      case 'ArrowLeft':
        if (node.expandable && node.expanded) collapseNode(node)
        else {
          const parent = parentNode(nodes, idx)
          if (parent) focusRow(parent.id)
        }
        break
      case 'Enter':
      case ' ':
        activateNode(node)
        break
    }
  }

  return (
    <TreeFocusContext.Provider value={{ focusedId: effectiveFocusedId, setFocusedId }}>
      <div className="sidebar">
        <div className="sidebar__title">
          <span className="section__title">Connections</span>
          <div style={{ display: 'flex', gap: 2 }}>
            <button className="icon-button" title="Add Connection" onClick={openNew}>
              <span className="codicon codicon-add" />
            </button>
            <button className="icon-button" title="Refresh" onClick={() => void refresh()}>
              <span className="codicon codicon-refresh" />
            </button>
            <button className="icon-button" title="Collapse All" onClick={collapseTree}>
              <span className="codicon codicon-collapse-all" />
            </button>
          </div>
        </div>
        <div className="tree" role="tree" ref={treeRef} onKeyDown={onKeyDown}>
          {connections.map((c) => (
            <ConnectionNode key={c.id} connection={c} openMenu={openMenu} />
          ))}
          {connections.length === 0 && (
            <div className="tree__empty">
              No connections yet. Click <span className="codicon codicon-add" /> above to add a
              RabbitMQ cluster.
            </div>
          )}
        </div>
        {menu && <ContextMenu {...menu} onClose={close} />}
      </div>
    </TreeFocusContext.Provider>
  )
}

/** ArrowRight expand: reveal a node's children using side-effect-free actions
 * (never opens a tab). */
function expandNode(node: TreeNode): void {
  const s = useAppStore.getState()
  if (node.kind === 'connection') {
    void s.revealConnection(node.connectionId)
  } else if (node.kind === 'group') {
    if (node.group === 'queues' && s.queuesCollapsed) s.toggleQueuesCollapsed()
    if (node.group === 'exchanges' && s.exchangesCollapsed) s.toggleExchangesCollapsed()
  }
}

/** ArrowLeft collapse. */
function collapseNode(node: TreeNode): void {
  const s = useAppStore.getState()
  if (node.kind === 'connection') s.collapseConnection(node.connectionId)
  else if (node.kind === 'group') {
    if (node.group === 'queues' && !s.queuesCollapsed) s.toggleQueuesCollapsed()
    if (node.group === 'exchanges' && !s.exchangesCollapsed) s.toggleExchangesCollapsed()
  }
}

/** Enter/Space activate. */
function activateNode(node: TreeNode): void {
  const s = useAppStore.getState()
  switch (node.kind) {
    case 'connection':
      void s.selectConnection(node.connectionId)
      break
    case 'queue':
      if (node.name != null) s.openQueueTab(node.connectionId, node.name)
      break
    case 'exchange':
      if (node.name != null) void s.openExchangeTab(node.connectionId, node.name)
      break
    case 'group':
      if (node.group === 'queues') s.toggleQueuesCollapsed()
      else s.toggleExchangesCollapsed()
      break
  }
}

/** Shared row props for roving-tabindex + ARIA. */
function useRowFocus(treeId: string): {
  tabIndex: number
  onFocus: () => void
} {
  const { focusedId, setFocusedId } = useTreeFocus()
  return { tabIndex: focusedId === treeId ? 0 : -1, onFocus: () => setFocusedId(treeId) }
}

function ConnectionNode({
  connection,
  openMenu
}: {
  connection: SafeConnectionConfig
  openMenu: OpenMenu
}) {
  const selectedId = useAppStore((s) => s.selectedConnectionId)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const collapsed = useAppStore((s) => s.connectionCollapsed)
  const state = useAppStore((s) => s.statuses[connection.id]?.state ?? 'disconnected')
  const select = useAppStore((s) => s.selectConnection)
  const connect = useAppStore((s) => s.connectConnection)
  const disconnect = useAppStore((s) => s.disconnectConnection)
  const toggleCollapsed = useAppStore((s) => s.toggleConnectionCollapsed)
  const expandConnection = useAppStore((s) => s.expandConnection)
  const collapseConnection = useAppStore((s) => s.collapseConnection)
  const refreshQueues = useAppStore((s) => s.refreshQueues)
  const refreshExchanges = useAppStore((s) => s.refreshExchanges)
  const edit = useAppStore((s) => s.editConnection)
  const del = useAppStore((s) => s.deleteConnection)
  const confirm = useAppStore((s) => s.confirm)
  const rowFocus = useRowFocus(connNodeId(connection.id))

  async function confirmDelete(): Promise<void> {
    const ok = await confirm({
      title: 'Delete connection',
      message: `Delete connection "${connection.name}"?`,
      confirmLabel: 'Delete',
      danger: true
    })
    if (ok) void del(connection.id)
  }

  const isSelected = selectedId === connection.id
  const expanded = isSelected && !collapsed
  const isConnected = isSelected && state === 'connected'
  const showingOverview = activeTabId === overviewTabId(connection.id)

  function menuItems(): MenuItem[] {
    const items: MenuItem[] = []
    if (isConnected) {
      items.push({
        label: 'Refresh',
        icon: 'refresh',
        onClick: () => {
          void refreshQueues()
          void refreshExchanges()
        }
      })
      items.push({
        label: 'Disconnect',
        icon: 'debug-disconnect',
        onClick: () => void disconnect(connection.id)
      })
    } else {
      items.push({ label: 'Connect', icon: 'plug', onClick: () => void connect(connection.id) })
    }
    items.push({ separator: true })
    items.push({ label: 'Edit Connection…', icon: 'edit', onClick: () => edit(connection) })
    items.push({
      label: 'Delete Connection',
      icon: 'trash',
      danger: true,
      onClick: () => void confirmDelete()
    })
    return items
  }

  return (
    <>
      <div
        className={`tree-row ${showingOverview ? 'is-active' : ''}`}
        style={{ paddingLeft: 8 }}
        role="treeitem"
        aria-level={1}
        aria-expanded={expanded}
        data-tree-id={connNodeId(connection.id)}
        data-conn={connection.name}
        tabIndex={rowFocus.tabIndex}
        onFocus={rowFocus.onFocus}
        onClick={() => void select(connection.id)}
        onContextMenu={(e) => openMenu(e, menuItems())}
      >
        <span
          className={`tree-row__twisty ${expanded ? 'is-open' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            if (isSelected) toggleCollapsed()
            else void select(connection.id)
          }}
        >
          <span className="codicon codicon-chevron-right" />
        </span>
        <span className="tree-row__icon">
          <span className="codicon codicon-server-environment" />
        </span>
        <span className="tree-row__label">{connection.name}</span>
        <span className={`status-dot status-dot--${state}`} style={{ marginLeft: 6 }} />
        <span className="tree-row__actions" style={{ marginLeft: 4 }}>
          <button
            className="icon-button"
            title={expanded ? 'Collapse all' : 'Expand all'}
            onClick={(e) => {
              e.stopPropagation()
              if (expanded) collapseConnection(connection.id)
              else void expandConnection(connection.id)
            }}
          >
            <span className={`codicon codicon-${expanded ? 'collapse-all' : 'expand-all'}`} />
          </button>
          <button
            className="icon-button"
            title="Edit"
            onClick={(e) => {
              e.stopPropagation()
              edit(connection)
            }}
          >
            <span className="codicon codicon-edit" />
          </button>
          <button
            className="icon-button"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation()
              void confirmDelete()
            }}
          >
            <span className="codicon codicon-trash" />
          </button>
        </span>
      </div>
      {expanded && <ConnectionChildren connectionId={connection.id} openMenu={openMenu} />}
    </>
  )
}

function ConnectionChildren({
  connectionId,
  openMenu
}: {
  connectionId: string
  openMenu: OpenMenu
}) {
  const state = useAppStore((s) => s.statuses[connectionId]?.state)
  const error = useAppStore((s) => s.statuses[connectionId]?.error)
  const queues = useAppStore((s) => s.queuesByConn[connectionId]) ?? []
  const exchanges = useAppStore((s) => s.exchangesByConn[connectionId]) ?? []
  const queuesCollapsed = useAppStore((s) => s.queuesCollapsed)
  const exchangesCollapsed = useAppStore((s) => s.exchangesCollapsed)
  const toggleQueues = useAppStore((s) => s.toggleQueuesCollapsed)
  const toggleExchanges = useAppStore((s) => s.toggleExchangesCollapsed)

  if (state === 'error') {
    return (
      <div className="tree__error" style={{ paddingLeft: 30 }}>
        <div className="tree__error-title">
          <span className="codicon codicon-error" />
          Failed to connect
        </div>
        {error && <div className="tree__error-detail">{error}</div>}
      </div>
    )
  }
  if (state !== 'connected') {
    return <div className="tree__empty" style={{ paddingLeft: 30 }}>Loading…</div>
  }

  return (
    <>
      <TreeGroup
        connectionId={connectionId}
        group="queues"
        label="Queues"
        count={queues.length}
        collapsed={queuesCollapsed}
        onToggle={toggleQueues}
        openMenu={openMenu}
      >
        {queues.length === 0 ? (
          <div className="tree__empty" style={{ paddingLeft: 46 }}>No queues.</div>
        ) : (
          queues.map((q) => (
            <QueueNode key={q.name} connectionId={connectionId} queue={q} openMenu={openMenu} />
          ))
        )}
      </TreeGroup>
      <TreeGroup
        connectionId={connectionId}
        group="exchanges"
        label="Exchanges"
        count={exchanges.length}
        collapsed={exchangesCollapsed}
        onToggle={toggleExchanges}
        openMenu={openMenu}
      >
        {exchanges.length === 0 ? (
          <div className="tree__empty" style={{ paddingLeft: 46 }}>No exchanges.</div>
        ) : (
          exchanges.map((x) => (
            <ExchangeNode
              key={x.name || '(default)'}
              connectionId={connectionId}
              exchange={x}
              openMenu={openMenu}
            />
          ))
        )}
      </TreeGroup>
    </>
  )
}

function TreeGroup({
  connectionId,
  group,
  label,
  count,
  collapsed,
  onToggle,
  openMenu,
  children
}: {
  connectionId: string
  group: 'queues' | 'exchanges'
  label: string
  count: number
  collapsed: boolean
  onToggle: () => void
  openMenu: OpenMenu
  children: ReactNode
}) {
  const rowFocus = useRowFocus(groupNodeId(connectionId, group))
  return (
    <>
      <div
        className="tree-row tree-group"
        style={{ paddingLeft: 24 }}
        role="treeitem"
        aria-level={2}
        aria-expanded={!collapsed}
        data-tree-id={groupNodeId(connectionId, group)}
        tabIndex={rowFocus.tabIndex}
        onFocus={rowFocus.onFocus}
        onClick={onToggle}
        onContextMenu={
          group === 'queues' ? (e) => openMenu(e, buildGroupMenu(connectionId, 'queues')) : undefined
        }
      >
        <span className={`tree-row__twisty ${collapsed ? '' : 'is-open'}`}>
          <span className="codicon codicon-chevron-right" />
        </span>
        <span className="tree-row__label tree-group__label">{label}</span>
        <span className="tree-row__detail">{count}</span>
      </div>
      {!collapsed && children}
    </>
  )
}

function QueueNode({
  connectionId,
  queue: q,
  openMenu
}: {
  connectionId: string
  queue: QueueInfo
  openMenu: OpenMenu
}) {
  const activeTabId = useAppStore((s) => s.activeTabId)
  const openQueueTab = useAppStore((s) => s.openQueueTab)
  const dlqSuffixes = useAppStore((s) => s.dlqSuffixes)
  const isActive = activeTabId === queueTabId(connectionId, q.name)
  const isDeadLetter = isDeadLetterQueue(q.name, dlqSuffixes)
  const rowFocus = useRowFocus(queueNodeId(connectionId, q.name))
  return (
    <div
      className={`tree-row ${isActive ? 'is-active' : ''}`}
      style={{ paddingLeft: 46 }}
      role="treeitem"
      aria-level={3}
      data-tree-id={queueNodeId(connectionId, q.name)}
      data-queue={q.name}
      tabIndex={rowFocus.tabIndex}
      onFocus={rowFocus.onFocus}
      onClick={() => openQueueTab(connectionId, q.name)}
      onContextMenu={(e) => openMenu(e, buildQueueMenu(connectionId, q))}
    >
      <span className="tree-row__twisty" />
      <span className="tree-row__icon">
        <span
          className="codicon codicon-inbox"
          style={isDeadLetter ? { color: 'var(--warning)' } : undefined}
        />
      </span>
      <span className="tree-row__label">{q.name}</span>
      {isDeadLetter && <span className="badge badge--dlq">DLQ</span>}
      <span className="tree-row__detail">{q.messages}</span>
    </div>
  )
}

function ExchangeNode({
  connectionId,
  exchange: x,
  openMenu
}: {
  connectionId: string
  exchange: ExchangeInfo
  openMenu: OpenMenu
}) {
  const activeTabId = useAppStore((s) => s.activeTabId)
  const openExchangeTab = useAppStore((s) => s.openExchangeTab)
  const isActive = activeTabId === exchangeTabId(connectionId, x.name)
  const label = x.name === '' ? '(AMQP default)' : x.name
  const rowFocus = useRowFocus(exchangeNodeId(connectionId, x.name))
  return (
    <div
      className={`tree-row ${isActive ? 'is-active' : ''}`}
      style={{ paddingLeft: 46 }}
      role="treeitem"
      aria-level={3}
      data-tree-id={exchangeNodeId(connectionId, x.name)}
      data-exchange={x.name}
      tabIndex={rowFocus.tabIndex}
      onFocus={rowFocus.onFocus}
      onClick={() => void openExchangeTab(connectionId, x.name)}
      onContextMenu={(e) => openMenu(e, buildExchangeMenu(connectionId, x))}
    >
      <span className="tree-row__twisty" />
      <span className="tree-row__icon">
        <span className="codicon codicon-symbol-namespace" />
      </span>
      <span className="tree-row__label">{label}</span>
      <span className="tree-row__detail">{x.type}</span>
    </div>
  )
}
