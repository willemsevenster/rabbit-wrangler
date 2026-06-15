import { useAppStore } from '../store/app-store'
import type { MenuItem } from '../components/ContextMenu'
import type { ExchangeInfo } from '@shared/types'

function exchangeSnapshot(x: ExchangeInfo) {
  return {
    name: x.name,
    vhost: x.vhost,
    type: x.type,
    durable: x.durable,
    autoDelete: x.autoDelete,
    internal: x.internal
  }
}

/** Context menu for an exchange, shared by the tree and the detail view. */
export function buildExchangeMenu(x: ExchangeInfo): MenuItem[] {
  const { selectExchange, openPublishDialog, deleteExchange } = useAppStore.getState()
  const isDefault = x.name === ''
  // Built-in exchanges (default + amq.*) can't be deleted.
  const isBuiltIn = isDefault || x.name.startsWith('amq.')

  return [
    { label: 'View Bindings', icon: 'references', onClick: () => void selectExchange(x.name) },
    { label: 'Publish Message…', icon: 'arrow-right', onClick: () => openPublishDialog(x.name) },
    { separator: true },
    {
      label: 'Copy Name',
      icon: 'copy',
      disabled: isDefault,
      onClick: () => window.api.copyText(x.name)
    },
    {
      label: 'Copy as JSON',
      icon: 'json',
      onClick: () => window.api.copyText(JSON.stringify(exchangeSnapshot(x), null, 2))
    },
    { separator: true },
    {
      label: 'Delete Exchange',
      icon: 'trash',
      danger: true,
      disabled: isBuiltIn,
      onClick: async () => {
        if (!confirm(`Delete exchange "${x.name}"? This cannot be undone.`)) return
        const result = await deleteExchange(x.name)
        if (!result.ok) alert(`Delete failed: ${result.error ?? 'unknown error'}`)
      }
    }
  ]
}
