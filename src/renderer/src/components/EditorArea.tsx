import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useAppStore, type EditorTab } from '../store/app-store'
import { QueueTable } from './QueueTable'
import { ClusterOverviewPanel } from './ClusterOverviewPanel'
import { MessagePeekPanel } from './MessagePeekPanel'
import { ExchangeDetail } from './ExchangeDetail'
import { ConnectionsView } from './ConnectionsView'
import { PoliciesView } from './PoliciesView'
import { ContextMenu, useContextMenu, type MenuItem } from './ContextMenu'
import { openManual } from '../lib/help'
import { formatBytes, formatRate } from '../lib/message-format'

const TAB_ICON: Record<EditorTab['kind'], string> = {
  overview: 'codicon-database',
  queue: 'codicon-inbox',
  exchange: 'codicon-symbol-namespace',
  connections: 'codicon-plug',
  policies: 'codicon-law'
}

/** Same icons, bare names, for the context-menu (overflow) list. */
const TAB_MENU_ICON: Record<EditorTab['kind'], string> = {
  overview: 'database',
  queue: 'inbox',
  exchange: 'symbol-namespace',
  connections: 'plug',
  policies: 'law'
}

/**
 * Central editor: a VSCode-style tab strip over the active tab's content. Tabs
 * (queue peeks, exchange detail, connection overview) are opened from the tree;
 * each keeps its own context and queue tabs keep peeking in the background.
 */
export function EditorArea() {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const connections = useAppStore((s) => s.connections)

  if (tabs.length === 0) return connections.length === 0 ? <Welcome /> : <NoTab />

  const active = tabs.find((t) => t.id === activeTabId) ?? null

  return (
    <div className="editor-area">
      <TabBar />
      {active?.kind === 'overview' && <OverviewTab tab={active} />}
      {active?.kind === 'queue' && <QueueTab tab={active} />}
      {active?.kind === 'exchange' && <ExchangeDetail tab={active} />}
      {active?.kind === 'connections' && <ConnectionsView tab={active} />}
      {active?.kind === 'policies' && <PoliciesView tab={active} />}
      {!active && <NoTab />}
    </div>
  )
}

function TabBar() {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const closeTab = useAppStore((s) => s.closeTab)
  const closeAllTabs = useAppStore((s) => s.closeAllTabs)
  const closeTabsToRight = useAppStore((s) => s.closeTabsToRight)
  const moveTab = useAppStore((s) => s.moveTab)
  const reorderTab = useAppStore((s) => s.reorderTab)
  const stripRef = useRef<HTMLDivElement>(null)
  const dragId = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [overflow, setOverflow] = useState<{ x: number; y: number } | null>(null)
  const { menu, openMenu, close } = useContextMenu()

  // Keep the active tab scrolled into view (e.g. after picking it from the overflow menu).
  useEffect(() => {
    const strip = stripRef.current
    if (!strip || !activeTabId) return
    const el = [...strip.querySelectorAll('[data-tab]')].find(
      (n) => n.getAttribute('data-tab') === activeTabId
    )
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabId])

  // Left/Right (Home/End) switch the active tab when the tab strip has focus.
  function onTabsKeyDown(e: ReactKeyboardEvent<HTMLDivElement>): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    if (tabs.length === 0) return
    e.preventDefault()
    const idx = tabs.findIndex((t) => t.id === activeTabId)
    let next = idx
    if (e.key === 'ArrowLeft') next = idx <= 0 ? 0 : idx - 1
    else if (e.key === 'ArrowRight') next = idx < 0 ? 0 : Math.min(tabs.length - 1, idx + 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    const t = tabs[next]
    if (!t) return
    setActiveTab(t.id)
    stripRef.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(t.id)}"]`)?.focus()
  }

  // Right-align the dropdown under the chevron (ContextMenu positions by its left edge).
  function openOverflow(el: HTMLElement) {
    const r = el.getBoundingClientRect()
    setOverflow({ x: Math.max(4, r.right - 340), y: r.bottom })
  }

  function tabMenu(t: EditorTab, index: number): MenuItem[] {
    const last = tabs.length - 1
    return [
      { label: 'Close Tab', icon: 'close', onClick: () => closeTab(t.id) },
      { label: 'Close All Tabs', icon: 'close-all', onClick: () => closeAllTabs() },
      {
        label: 'Close Tabs to the Right',
        icon: 'chevron-right',
        disabled: index >= last,
        onClick: () => closeTabsToRight(t.id)
      },
      { separator: true },
      {
        label: 'Move Left',
        icon: 'arrow-left',
        disabled: index === 0,
        onClick: () => moveTab(t.id, 'left')
      },
      {
        label: 'Move Right',
        icon: 'arrow-right',
        disabled: index >= last,
        onClick: () => moveTab(t.id, 'right')
      },
      {
        label: 'Move to Start',
        icon: 'arrow-circle-left',
        disabled: index === 0,
        onClick: () => moveTab(t.id, 'start')
      },
      {
        label: 'Move to End',
        icon: 'arrow-circle-right',
        disabled: index >= last,
        onClick: () => moveTab(t.id, 'end')
      }
    ]
  }

  const overflowItems: MenuItem[] = tabs.map((t) => {
    const unread = t.kind === 'queue' ? t.unread : 0
    return {
      label: t.title,
      title: t.title,
      icon: TAB_MENU_ICON[t.kind],
      badge: unread > 0 ? (unread > 99 ? '99+' : String(unread)) : undefined,
      onClick: () => setActiveTab(t.id)
    }
  })

  return (
    <div className="tabbar">
      <div
        className="tabbar__tabs"
        ref={stripRef}
        role="tablist"
        onKeyDown={onTabsKeyDown}
        onWheel={(e) => {
          // Translate vertical wheel into horizontal tab scrolling.
          if (e.deltaY !== 0 && stripRef.current) stripRef.current.scrollLeft += e.deltaY
        }}
      >
        {tabs.map((t, i) => {
          const isActive = t.id === activeTabId
          const unread = t.kind === 'queue' ? t.unread : 0
          return (
            <div
              key={t.id}
              className={`tab ${isActive ? 'is-active' : ''} ${dragOverId === t.id ? 'is-dragover' : ''}`}
              data-tab={t.id}
              title={t.title}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              draggable
              onClick={() => setActiveTab(t.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  closeTab(t.id)
                }
              }}
              onContextMenu={(e) => openMenu(e, tabMenu(t, i))}
              onDragStart={(e) => {
                dragId.current = t.id
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (dragId.current && dragId.current !== t.id) {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOverId(t.id)
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                const from = dragId.current
                if (from && from !== t.id) {
                  reorderTab(
                    from,
                    tabs.findIndex((x) => x.id === t.id)
                  )
                }
                dragId.current = null
                setDragOverId(null)
              }}
              onDragEnd={() => {
                dragId.current = null
                setDragOverId(null)
              }}
            >
              <span className="tab__icon">
                <span className={`codicon ${TAB_ICON[t.kind]}`} />
              </span>
              <span className="tab__label">{t.title}</span>
              <span className="tab__trailing">
                {unread > 0 && !isActive && (
                  <span className="tab__badge">{unread > 99 ? '99+' : unread}</span>
                )}
                <button
                  className="tab__close"
                  title="Close tab"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(t.id)
                  }}
                >
                  <span className="codicon codicon-close" />
                </button>
              </span>
            </div>
          )
        })}
      </div>

      {tabs.length > 0 && (
        <button
          className="tabbar__overflow"
          title="Show all tabs"
          aria-label="Show all open tabs"
          onClick={(e) => (overflow ? setOverflow(null) : openOverflow(e.currentTarget))}
        >
          <span className="codicon codicon-chevron-down" />
        </button>
      )}

      {overflow && (
        <ContextMenu
          x={overflow.x}
          y={overflow.y}
          items={overflowItems}
          onClose={() => setOverflow(null)}
        />
      )}

      {menu && <ContextMenu {...menu} onClose={close} />}
    </div>
  )
}

function OverviewTab({ tab }: { tab: Extract<EditorTab, { kind: 'overview' }> }) {
  const refreshTab = useAppStore((s) => s.refreshTab)
  const refreshCluster = useAppStore((s) => s.refreshCluster)
  // Populate the cluster panel immediately on open; the cluster-stats poll keeps
  // it live thereafter.
  useEffect(() => {
    void refreshCluster(tab.connectionId)
  }, [refreshCluster, tab.connectionId])
  return (
    <div className="editor">
      <div className="editor__header">
        <h2>
          <span className="codicon codicon-database" />
          {tab.title} · Overview
        </h2>
        <span className="spacer" />
        <button className="btn btn--sm btn--secondary" onClick={() => void refreshTab(tab.id)}>
          <span className="codicon codicon-refresh" />
          Refresh
        </button>
      </div>
      <div className="editor__body" style={{ overflow: 'auto' }}>
        <ClusterOverviewPanel connectionId={tab.connectionId} />
        <QueueTable connectionId={tab.connectionId} />
      </div>
    </div>
  )
}

function QueueTab({ tab }: { tab: Extract<EditorTab, { kind: 'queue' }> }) {
  const purgeQueue = useAppStore((s) => s.purgeQueue)
  const refreshTab = useAppStore((s) => s.refreshTab)
  const openMoveDialog = useAppStore((s) => s.openMoveDialog)
  const maybeConfirm = useAppStore((s) => s.maybeConfirm)
  const addToast = useAppStore((s) => s.addToast)
  // Live broker stats for this queue (pushed via queue-stats; updates on its own).
  const info = useAppStore((s) =>
    s.queuesByConn[tab.connectionId]?.find((q) => q.name === tab.queue)
  )
  // HTTP browse mode is read-only — Move needs the AMQP port.
  const httpOnly = useAppStore((s) => (s.statuses[tab.connectionId]?.transport ?? 'amqp') === 'http')

  async function purge() {
    const ok = await maybeConfirm({
      title: 'Purge queue',
      message: `Purge all messages from "${tab.queue}"? This cannot be undone.`,
      confirmLabel: 'Purge',
      danger: true
    })
    if (!ok) return
    const result = await purgeQueue(tab.queue, tab.connectionId)
    if (!result.ok) addToast('error', `Purge failed: ${result.error ?? 'unknown error'}`)
  }

  return (
    <div className="editor">
      <div className="editor__header">
        <h2>
          <span className="codicon codicon-inbox" />
          {tab.queue}
          {httpOnly && (
            <span
              className="badge badge--http"
              title="Browsing over HTTP (AMQP unavailable or HTTP mode selected) — read-only"
            >
              HTTP browse
            </span>
          )}
        </h2>
        <span className="spacer" />
        <button
          className="btn btn--sm btn--secondary"
          title="Clear this tab and re-peek from the head of the queue"
          onClick={() => void refreshTab(tab.id)}
        >
          <span className="codicon codicon-refresh" />
          Refresh
        </button>
        <button
          className="btn btn--sm btn--secondary"
          disabled={httpOnly}
          title={httpOnly ? 'Moving needs AMQP (unavailable in HTTP browse mode)' : 'Move messages'}
          onClick={() => openMoveDialog(tab.queue, tab.connectionId)}
        >
          <span className="codicon codicon-arrow-right" />
          Move
        </button>
        <button className="btn btn--sm btn--danger" onClick={() => void purge()}>
          <span className="codicon codicon-trash" />
          Purge
        </button>
        <button
          className="icon-button"
          title="How peeking works (manual)"
          aria-label="How peeking works (manual)"
          onClick={() => openManual('peeking-messages')}
        >
          <span className="codicon codicon-question" />
        </button>
      </div>
      {info && (
        <div className="queue-stats">
          <span>
            <b>{info.messagesReady}</b> ready
          </span>
          <span>
            <b>{info.messagesUnacknowledged}</b> unacked
          </span>
          <span>
            <b>{info.messages}</b> total
          </span>
          <span>
            <b>{info.consumers}</b> consumer{info.consumers === 1 ? '' : 's'}
          </span>
          {info.publishRate != null && <span>pub {formatRate(info.publishRate)}</span>}
          {info.deliverRate != null && <span>deliver {formatRate(info.deliverRate)}</span>}
          {info.ackRate != null && <span>ack {formatRate(info.ackRate)}</span>}
          {info.memory != null && <span>{formatBytes(info.memory)} mem</span>}
          {info.idleSince && (
            <span className="queue-stats__idle">
              idle since {new Date(info.idleSince).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}
      <div className="editor__body" style={{ display: 'flex', flexDirection: 'column' }}>
        <MessagePeekPanel tab={tab} />
      </div>
    </div>
  )
}

function NoTab() {
  return (
    <div className="editor">
      <div className="welcome">
        <p>No tab open.</p>
        <p>Select a connection, queue or exchange in the sidebar to open one.</p>
      </div>
    </div>
  )
}

function Welcome() {
  const openNew = useAppStore((s) => s.openNewConnection)
  return (
    <div className="editor">
      <div className="welcome">
        <h1>🐰 Rabbit Wrangler</h1>
        <p>Peek messages, move dead-letters and purge queues across your RabbitMQ clusters.</p>
        <p>Add a connection to get started.</p>
        <button className="btn" onClick={openNew} style={{ marginTop: 8 }}>
          <span className="codicon codicon-add" style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Add Connection
        </button>
      </div>
    </div>
  )
}
