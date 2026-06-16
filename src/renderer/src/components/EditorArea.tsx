import { useEffect, useRef, useState } from 'react'
import { useAppStore, type EditorTab } from '../store/app-store'
import { QueueTable } from './QueueTable'
import { MessagePeekPanel } from './MessagePeekPanel'
import { ExchangeDetail } from './ExchangeDetail'
import { ContextMenu, type MenuItem } from './ContextMenu'

const TAB_ICON: Record<EditorTab['kind'], string> = {
  overview: 'codicon-database',
  queue: 'codicon-inbox',
  exchange: 'codicon-symbol-namespace'
}

/** Same icons, bare names, for the context-menu (overflow) list. */
const TAB_MENU_ICON: Record<EditorTab['kind'], string> = {
  overview: 'database',
  queue: 'inbox',
  exchange: 'symbol-namespace'
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
      {!active && <NoTab />}
    </div>
  )
}

function TabBar() {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const closeTab = useAppStore((s) => s.closeTab)
  const stripRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState<{ x: number; y: number } | null>(null)

  // Keep the active tab scrolled into view (e.g. after picking it from the overflow menu).
  useEffect(() => {
    const strip = stripRef.current
    if (!strip || !activeTabId) return
    const el = [...strip.querySelectorAll('[data-tab]')].find(
      (n) => n.getAttribute('data-tab') === activeTabId
    )
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabId])

  // Right-align the dropdown under the chevron (ContextMenu positions by its left edge).
  function openOverflow(el: HTMLElement) {
    const r = el.getBoundingClientRect()
    setOverflow({ x: Math.max(4, r.right - 240), y: r.bottom })
  }

  const overflowItems: MenuItem[] = tabs.map((t) => {
    const unread = t.kind === 'queue' && t.unread > 0 ? `  (${t.unread})` : ''
    return {
      label: `${t.title}${unread}`,
      icon: TAB_MENU_ICON[t.kind],
      onClick: () => setActiveTab(t.id)
    }
  })

  return (
    <div className="tabbar">
      <div
        className="tabbar__tabs"
        ref={stripRef}
        role="tablist"
        onWheel={(e) => {
          // Translate vertical wheel into horizontal tab scrolling.
          if (e.deltaY !== 0 && stripRef.current) stripRef.current.scrollLeft += e.deltaY
        }}
      >
        {tabs.map((t) => {
          const isActive = t.id === activeTabId
          const unread = t.kind === 'queue' ? t.unread : 0
          return (
            <div
              key={t.id}
              className={`tab ${isActive ? 'is-active' : ''}`}
              data-tab={t.id}
              title={t.title}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(t.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  closeTab(t.id)
                }
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
    </div>
  )
}

function OverviewTab({ tab }: { tab: Extract<EditorTab, { kind: 'overview' }> }) {
  const refreshTab = useAppStore((s) => s.refreshTab)
  return (
    <div className="editor">
      <div className="editor__header">
        <h2>
          <span className="codicon codicon-database" />
          {tab.title} · Queues
        </h2>
        <span className="spacer" />
        <button className="btn btn--sm btn--secondary" onClick={() => void refreshTab(tab.id)}>
          <span className="codicon codicon-refresh" />
          Refresh
        </button>
      </div>
      <div className="editor__body">
        <QueueTable connectionId={tab.connectionId} />
      </div>
    </div>
  )
}

function QueueTab({ tab }: { tab: Extract<EditorTab, { kind: 'queue' }> }) {
  const purgeQueue = useAppStore((s) => s.purgeQueue)
  const refreshTab = useAppStore((s) => s.refreshTab)
  const openMoveDialog = useAppStore((s) => s.openMoveDialog)

  async function purge() {
    if (!confirm(`Purge all messages from "${tab.queue}"? This cannot be undone.`)) return
    const result = await purgeQueue(tab.queue, tab.connectionId)
    if (!result.ok) alert(`Purge failed: ${result.error ?? 'unknown error'}`)
  }

  return (
    <div className="editor">
      <div className="editor__header">
        <h2>
          <span className="codicon codicon-inbox" />
          {tab.queue}
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
          onClick={() => openMoveDialog(tab.queue, tab.connectionId)}
        >
          <span className="codicon codicon-arrow-right" />
          Move
        </button>
        <button className="btn btn--sm btn--danger" onClick={() => void purge()}>
          <span className="codicon codicon-trash" />
          Purge
        </button>
      </div>
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
