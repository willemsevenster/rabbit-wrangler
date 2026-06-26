import { useAppStore, type EditorTab } from '../store/app-store'
import type { PermissionInfo, TopicPermissionInfo } from '@shared/types'

type AdminTab = Extract<EditorTab, { kind: 'admin' }>

/** Render a permission regex cell: blank = none, `.*` = all, else the raw pattern. */
function Regex({ value }: { value: string }) {
  if (value === '') return <span className="msg-table__muted">(none)</span>
  if (value === '.*') return <span>all</span>
  return <code>{value}</code>
}

/** Permissions sub-view of the Administration tab: standard (configure/write/read)
 * permissions per (user, vhost), plus topic permissions per exchange. */
export function PermissionsSection({ tab }: { tab: AdminTab }) {
  const openPermissionDialog = useAppStore((s) => s.openPermissionDialog)
  const deletePermission = useAppStore((s) => s.deletePermission)
  const openTopicPermissionDialog = useAppStore((s) => s.openTopicPermissionDialog)
  const deleteTopicPermission = useAppStore((s) => s.deleteTopicPermission)
  const confirm = useAppStore((s) => s.confirm)
  const ownVhost = useAppStore((s) => s.connections.find((c) => c.id === tab.connectionId)?.vhost)

  const { permissions, topicPermissions, currentUser } = tab

  async function onDeletePermission(p: PermissionInfo): Promise<void> {
    const isSelf = p.user === currentUser?.name && p.vhost === ownVhost
    const ok = await confirm({
      title: 'Remove permissions',
      message:
        `Remove "${p.user}" permissions on virtual host "${p.vhost}"?` +
        (isSelf ? ` This is your own user on the vhost this connection targets — you may lose access.` : ''),
      confirmLabel: 'Remove',
      danger: true
    })
    if (!ok) return
    await deletePermission(tab.connectionId, p.vhost, p.user)
  }

  async function onDeleteTopic(p: TopicPermissionInfo): Promise<void> {
    const ok = await confirm({
      title: 'Remove topic permissions',
      message: `Remove "${p.user}" topic permissions on "${p.vhost}"? This clears them for all exchanges in that vhost.`,
      confirmLabel: 'Remove',
      danger: true
    })
    if (!ok) return
    await deleteTopicPermission(tab.connectionId, p.vhost, p.user)
  }

  return (
    <>
      <div className="admin-toolbar">
        <button className="btn btn--sm" onClick={() => openPermissionDialog(tab.connectionId)}>
          <span className="codicon codicon-add" />
          Set Permission
        </button>
      </div>
      {permissions.length === 0 ? (
        <p className="placeholder" style={{ padding: 0 }}>
          No permissions set.
        </p>
      ) : (
        <table className="queue-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Virtual host</th>
              <th>Configure</th>
              <th>Write</th>
              <th>Read</th>
              <th style={{ width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {permissions.map((p) => (
              <tr key={`${p.vhost}:${p.user}`} data-perm={`${p.vhost}:${p.user}`}>
                <td>{p.user}</td>
                <td>{p.vhost === '/' ? <code>/</code> : p.vhost}</td>
                <td>
                  <Regex value={p.configure} />
                </td>
                <td>
                  <Regex value={p.write} />
                </td>
                <td>
                  <Regex value={p.read} />
                </td>
                <td className="policy-actions">
                  <button
                    className="icon-button"
                    title="Edit permissions"
                    onClick={() => openPermissionDialog(tab.connectionId, p)}
                  >
                    <span className="codicon codicon-edit" />
                  </button>
                  <button
                    className="icon-button"
                    title="Remove permissions"
                    onClick={() => void onDeletePermission(p)}
                  >
                    <span className="codicon codicon-trash" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="admin-section-heading">
        <span>Topic permissions</span>
        <button
          className="btn btn--sm btn--secondary"
          onClick={() => openTopicPermissionDialog(tab.connectionId)}
        >
          <span className="codicon codicon-add" />
          Set Topic Permission
        </button>
      </div>
      <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
        Topic permissions further restrict publish/consume on <b>topic</b> exchanges by routing-key
        pattern, on top of the standard permissions above.
      </p>
      {topicPermissions.length === 0 ? (
        <p className="placeholder" style={{ padding: 0 }}>
          No topic permissions set.
        </p>
      ) : (
        <table className="queue-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Virtual host</th>
              <th>Exchange</th>
              <th>Write</th>
              <th>Read</th>
              <th style={{ width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {topicPermissions.map((p) => (
              <tr key={`${p.vhost}:${p.user}:${p.exchange}`}>
                <td>{p.user}</td>
                <td>{p.vhost === '/' ? <code>/</code> : p.vhost}</td>
                <td>{p.exchange || <span className="msg-table__muted">(all)</span>}</td>
                <td>
                  <Regex value={p.write} />
                </td>
                <td>
                  <Regex value={p.read} />
                </td>
                <td className="policy-actions">
                  <button
                    className="icon-button"
                    title="Edit topic permissions"
                    onClick={() => openTopicPermissionDialog(tab.connectionId, p)}
                  >
                    <span className="codicon codicon-edit" />
                  </button>
                  <button
                    className="icon-button"
                    title="Remove topic permissions"
                    onClick={() => void onDeleteTopic(p)}
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
