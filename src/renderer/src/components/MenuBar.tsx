import { useState } from 'react'
import { useAppStore } from '../store/app-store'
import { ContextMenu, type MenuItem } from './ContextMenu'

/** VSCode-style menu bar (Connections / Queues / View / Help) in the title bar. */
export function MenuBar() {
  const [open, setOpen] = useState<{ index: number; x: number; y: number } | null>(null)

  const openNew = useAppStore((s) => s.openNewConnection)
  const refreshConnections = useAppStore((s) => s.refreshConnections)
  const disconnect = useAppStore((s) => s.disconnectConnection)
  const refreshQueues = useAppStore((s) => s.refreshQueues)
  const purgeQueue = useAppStore((s) => s.purgeQueue)
  const selectedConnectionId = useAppStore((s) => s.selectedConnectionId)
  const activeTab = useAppStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null)
  const sidebarVisible = useAppStore((s) => s.sidebarVisible)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const openSettings = useAppStore((s) => s.openSettings)
  const checkForUpdates = useAppStore((s) => s.checkForUpdates)
  const maybeConfirm = useAppStore((s) => s.maybeConfirm)
  const addToast = useAppStore((s) => s.addToast)
  const openAbout = useAppStore((s) => s.openAbout)
  const exportConnections = useAppStore((s) => s.exportConnections)
  const startImport = useAppStore((s) => s.startImport)

  const activeQueue = activeTab?.kind === 'queue' ? activeTab : null

  const menus: { label: string; items: () => MenuItem[] }[] = [
    {
      label: 'Connections',
      items: () => [
        { label: 'Add Connection…', icon: 'add', onClick: openNew },
        { label: 'Refresh Connections', icon: 'refresh', onClick: () => void refreshConnections() },
        { separator: true },
        { label: 'Import Connections…', icon: 'cloud-download', onClick: () => void startImport() },
        { label: 'Export Connections…', icon: 'save', onClick: () => void exportConnections() },
        { separator: true },
        {
          label: 'Disconnect',
          icon: 'debug-disconnect',
          disabled: !selectedConnectionId,
          onClick: () => selectedConnectionId && void disconnect(selectedConnectionId)
        },
        { separator: true },
        { label: 'Exit', icon: 'sign-out', onClick: () => void window.api.quitApp() }
      ]
    },
    {
      label: 'Queues',
      items: () => [
        {
          label: 'Refresh Queues',
          icon: 'refresh',
          disabled: !selectedConnectionId,
          onClick: () => void refreshQueues()
        },
        { separator: true },
        {
          label: 'Purge Active Queue…',
          icon: 'trash',
          danger: true,
          disabled: !activeQueue,
          onClick: async () => {
            if (!activeQueue) return
            const ok = await maybeConfirm({
              title: 'Purge queue',
              message: `Purge all messages from "${activeQueue.queue}"? This cannot be undone.`,
              confirmLabel: 'Purge',
              danger: true
            })
            if (!ok) return
            const r = await purgeQueue(activeQueue.queue, activeQueue.connectionId)
            if (!r.ok) addToast('error', `Purge failed: ${r.error ?? 'unknown error'}`)
          }
        }
      ]
    },
    {
      label: 'View',
      items: () => [
        {
          label: sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar',
          icon: 'layout-sidebar-left',
          onClick: toggleSidebar
        },
        {
          label: theme === 'dark' ? 'Light Theme' : 'Dark Theme',
          icon: 'color-mode',
          onClick: toggleTheme
        },
        { separator: true },
        { label: 'Settings…', icon: 'settings-gear', onClick: openSettings },
        { label: 'Reload', icon: 'refresh', onClick: () => location.reload() }
      ]
    },
    {
      label: 'Help',
      items: () => [
        { label: 'Check for Updates…', icon: 'cloud', onClick: () => checkForUpdates() },
        { separator: true },
        {
          label: 'About Rabbit Wrangler',
          icon: 'info',
          onClick: openAbout
        }
      ]
    }
  ]

  function openAt(index: number, el: HTMLElement) {
    const r = el.getBoundingClientRect()
    setOpen({ index, x: r.left, y: r.bottom })
  }

  return (
    <div className="menubar">
      {menus.map((m, i) => (
        <button
          key={m.label}
          className={`menubar__item ${open?.index === i ? 'is-open' : ''}`}
          onClick={(e) => (open?.index === i ? setOpen(null) : openAt(i, e.currentTarget))}
          onMouseEnter={(e) => open && open.index !== i && openAt(i, e.currentTarget)}
        >
          {m.label}
        </button>
      ))}
      {open && (
        <ContextMenu
          x={open.x}
          y={open.y}
          items={menus[open.index].items()}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
