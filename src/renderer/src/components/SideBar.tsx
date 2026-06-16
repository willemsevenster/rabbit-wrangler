import { type MouseEvent, type ReactNode } from 'react'
import { useAppStore, overviewTabId, queueTabId, exchangeTabId } from '../store/app-store'
import { ContextMenu, useContextMenu, type MenuItem } from './ContextMenu'
import { buildQueueMenu } from '../lib/queue-menu'
import { buildExchangeMenu } from '../lib/exchange-menu'
import type { ExchangeInfo, QueueInfo, SafeConnectionConfig } from '@shared/types'

type OpenMenu = (e: MouseEvent, items: MenuItem[]) => void

/** VSCode-style explorer: the Connections tree plus its toolbar. */
export function SideBar() {
  const connections = useAppStore((s) => s.connections)
  const openNew = useAppStore((s) => s.openNewConnection)
  const refresh = useAppStore((s) => s.refreshConnections)
  const { menu, openMenu, close } = useContextMenu()

  return (
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
        </div>
      </div>
      <div className="tree">
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
  )
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
  const refreshQueues = useAppStore((s) => s.refreshQueues)
  const refreshExchanges = useAppStore((s) => s.refreshExchanges)
  const edit = useAppStore((s) => s.editConnection)
  const del = useAppStore((s) => s.deleteConnection)

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
      onClick: () => {
        if (confirm(`Delete connection "${connection.name}"?`)) void del(connection.id)
      }
    })
    return items
  }

  return (
    <>
      <div
        className={`tree-row ${showingOverview ? 'is-active' : ''}`}
        style={{ paddingLeft: 8 }}
        data-conn={connection.name}
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
              if (confirm(`Delete connection "${connection.name}"?`)) void del(connection.id)
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
      <TreeGroup label="Queues" count={queues.length} collapsed={queuesCollapsed} onToggle={toggleQueues}>
        {queues.length === 0 ? (
          <div className="tree__empty" style={{ paddingLeft: 46 }}>No queues.</div>
        ) : (
          queues.map((q) => (
            <QueueNode key={q.name} connectionId={connectionId} queue={q} openMenu={openMenu} />
          ))
        )}
      </TreeGroup>
      <TreeGroup
        label="Exchanges"
        count={exchanges.length}
        collapsed={exchangesCollapsed}
        onToggle={toggleExchanges}
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
  label,
  count,
  collapsed,
  onToggle,
  children
}: {
  label: string
  count: number
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <>
      <div className="tree-row tree-group" style={{ paddingLeft: 24 }} onClick={onToggle}>
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
  const isActive = activeTabId === queueTabId(connectionId, q.name)
  return (
    <div
      className={`tree-row ${isActive ? 'is-active' : ''}`}
      style={{ paddingLeft: 46 }}
      data-queue={q.name}
      onClick={() => openQueueTab(connectionId, q.name)}
      onContextMenu={(e) => openMenu(e, buildQueueMenu(connectionId, q))}
    >
      <span className="tree-row__twisty" />
      <span className="tree-row__icon">
        <span
          className="codicon codicon-inbox"
          style={q.isDeadLetter ? { color: 'var(--warning)' } : undefined}
        />
      </span>
      <span className="tree-row__label">{q.name}</span>
      {q.isDeadLetter && <span className="badge badge--dlq">DLQ</span>}
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
  return (
    <div
      className={`tree-row ${isActive ? 'is-active' : ''}`}
      style={{ paddingLeft: 46 }}
      data-exchange={x.name}
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
