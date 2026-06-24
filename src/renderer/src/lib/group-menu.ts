import { useAppStore } from '../store/app-store'
import type { MenuItem } from '../components/ContextMenu'

/**
 * Context menu for a tree group header (currently the "Queues" group): bulk
 * open/close of that connection's queue tabs. Reads live actions from the store
 * at open-time, like the queue/exchange menu builders.
 */
export function buildGroupMenu(connectionId: string, group: 'queues'): MenuItem[] {
  const { openAllQueueTabs, closeAllQueueTabs, openCreateQueueDialog, queuesByConn, tabs } =
    useAppStore.getState()
  if (group !== 'queues') return []
  const queueCount = (queuesByConn[connectionId] ?? []).length
  const openCount = tabs.filter((t) => t.kind === 'queue' && t.connectionId === connectionId).length
  return [
    {
      label: 'Create Queue…',
      icon: 'add',
      onClick: () => openCreateQueueDialog(connectionId)
    },
    { separator: true },
    {
      label: 'Open All Queue Tabs',
      icon: 'multiple-windows',
      disabled: queueCount === 0,
      onClick: () => openAllQueueTabs(connectionId)
    },
    {
      label: 'Close All Queue Tabs',
      icon: 'close-all',
      disabled: openCount === 0,
      onClick: () => closeAllQueueTabs(connectionId)
    }
  ]
}
