import { useAppStore } from '../store/app-store'
import type { MenuItem } from '../components/ContextMenu'
import type { QueueInfo } from '@shared/types'

/** A plain, copy-friendly view of a queue's stats. */
function queueSnapshot(q: QueueInfo) {
  return {
    name: q.name,
    vhost: q.vhost,
    state: q.state,
    durable: q.durable,
    messages: q.messages,
    messagesReady: q.messagesReady,
    messagesUnacknowledged: q.messagesUnacknowledged,
    consumers: q.consumers,
    isDeadLetter: q.isDeadLetter
  }
}

/**
 * The context menu for a queue, shared by the sidebar tree and the overview
 * table so both behave identically. Reads live actions from the store at
 * open-time.
 */
export function buildQueueMenu(connectionId: string, q: QueueInfo): MenuItem[] {
  const { openQueueTab, refreshQueues, purgeQueue, openMoveDialog, confirm, addToast } =
    useAppStore.getState()
  return [
    { label: 'Peek Messages', icon: 'eye', onClick: () => openQueueTab(connectionId, q.name) },
    { label: 'Refresh', icon: 'refresh', onClick: () => void refreshQueues(connectionId) },
    { separator: true },
    { label: 'Copy Queue Name', icon: 'copy', onClick: () => window.api.copyText(q.name) },
    {
      label: 'Copy as JSON',
      icon: 'json',
      onClick: () => window.api.copyText(JSON.stringify(queueSnapshot(q), null, 2))
    },
    { separator: true },
    {
      label: 'Move Messages…',
      icon: 'arrow-right',
      onClick: () => openMoveDialog(q.name, connectionId)
    },
    {
      label: 'Purge…',
      icon: 'trash',
      danger: true,
      onClick: async () => {
        const ok = await confirm({
          title: 'Purge queue',
          message: `Purge all messages from "${q.name}"? This cannot be undone.`,
          confirmLabel: 'Purge',
          danger: true
        })
        if (!ok) return
        const result = await purgeQueue(q.name, connectionId)
        if (!result.ok) addToast('error', `Purge failed: ${result.error ?? 'unknown error'}`)
      }
    }
  ]
}
