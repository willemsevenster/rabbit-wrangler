import { useAppStore, type EditorTab } from '../store/app-store'
import type { VhostInfo } from '@shared/types'

type AdminTab = Extract<EditorTab, { kind: 'admin' }>

/** Vhosts sub-view of the Administration tab: list / create / edit / delete virtual
 * hosts (cluster-wide). Deleting a vhost drops everything in it, so it's strongly
 * guarded — with an extra warning when it's the vhost this connection targets. */
export function VhostsSection({ tab }: { tab: AdminTab }) {
  const openVhostDialog = useAppStore((s) => s.openVhostDialog)
  const deleteVhost = useAppStore((s) => s.deleteVhost)
  const confirm = useAppStore((s) => s.confirm)
  const ownVhost = useAppStore((s) => s.connections.find((c) => c.id === tab.connectionId)?.vhost)

  const { vhosts } = tab

  async function onDelete(v: VhostInfo): Promise<void> {
    const isOwn = v.name === ownVhost
    const ok = await confirm({
      title: 'Delete virtual host',
      message:
        `Delete virtual host "${v.name}"? This permanently removes EVERY queue, exchange, ` +
        `binding and message in it — it cannot be undone.` +
        (isOwn ? ` This is the vhost THIS connection targets, so you may lose access.` : ''),
      confirmLabel: 'Delete',
      danger: true
    })
    if (!ok) return
    await deleteVhost(tab.connectionId, v.name)
  }

  return (
    <>
      <div className="admin-toolbar">
        <button className="btn btn--sm" onClick={() => openVhostDialog(tab.connectionId)}>
          <span className="codicon codicon-add" />
          Add Vhost
        </button>
      </div>
      {vhosts.length === 0 ? (
        <p className="placeholder" style={{ padding: 0 }}>
          No virtual hosts on this broker.
        </p>
      ) : (
        <table className="queue-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Default queue type</th>
              <th className="num">Messages</th>
              <th style={{ width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {vhosts.map((v) => (
              <tr key={v.name} data-vhost={v.name}>
                <td>
                  {v.name === '/' ? <code>/</code> : v.name}
                  {v.name === ownVhost && <span className="badge">this connection</span>}
                </td>
                <td className="msg-table__muted">{v.description || '—'}</td>
                <td className="msg-table__muted">{v.defaultQueueType || '—'}</td>
                <td className="num">{v.messages ?? '—'}</td>
                <td className="policy-actions">
                  <button
                    className="icon-button"
                    title="Edit virtual host"
                    onClick={() => openVhostDialog(tab.connectionId, v)}
                  >
                    <span className="codicon codicon-edit" />
                  </button>
                  <button
                    className="icon-button"
                    title="Delete virtual host"
                    onClick={() => void onDelete(v)}
                  >
                    <span className="codicon codicon-trash" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
