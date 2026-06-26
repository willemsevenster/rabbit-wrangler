import { useAppStore, type EditorTab } from '../store/app-store'
import type { UserInfo } from '@shared/types'

type AdminTab = Extract<EditorTab, { kind: 'admin' }>

/** Users sub-view of the Administration tab: list / create / edit / delete broker
 * users (cluster-wide). Deleting the connected user is guarded against self-lockout. */
export function UsersSection({ tab }: { tab: AdminTab }) {
  const openUserDialog = useAppStore((s) => s.openUserDialog)
  const deleteUser = useAppStore((s) => s.deleteUser)
  const confirm = useAppStore((s) => s.confirm)

  const { users, currentUser } = tab

  async function onDelete(u: UserInfo): Promise<void> {
    const isSelf = currentUser?.name === u.name
    const ok = await confirm({
      title: 'Delete user',
      message: isSelf
        ? `Delete user "${u.name}"? This is the user THIS connection authenticates as — you may lose access to the broker.`
        : `Delete user "${u.name}"? Any permissions granted to it are removed too.`,
      confirmLabel: 'Delete',
      danger: true
    })
    if (!ok) return
    await deleteUser(tab.connectionId, u.name)
  }

  return (
    <>
      <div className="admin-toolbar">
        <button className="btn btn--sm" onClick={() => openUserDialog(tab.connectionId)}>
          <span className="codicon codicon-add" />
          Add User
        </button>
      </div>
      {users.length === 0 ? (
        <p className="placeholder" style={{ padding: 0 }}>
          No users on this broker.
        </p>
      ) : (
        <table className="queue-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Tags</th>
              <th>Password</th>
              <th style={{ width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.name} data-user={u.name}>
                <td>
                  {u.name}
                  {currentUser?.name === u.name && <span className="badge">you</span>}
                </td>
                <td>
                  {u.tags.length === 0 ? (
                    <span className="msg-table__muted">(none)</span>
                  ) : (
                    <span className="tag-chips">
                      {u.tags.map((t) => (
                        <span key={t} className="tag-chip is-static">
                          {t}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="msg-table__muted">{u.hasPassword ? 'set' : 'passwordless'}</td>
                <td className="policy-actions">
                  <button
                    className="icon-button"
                    title="Edit user"
                    onClick={() => openUserDialog(tab.connectionId, u)}
                  >
                    <span className="codicon codicon-edit" />
                  </button>
                  <button
                    className="icon-button"
                    title="Delete user"
                    onClick={() => void onDelete(u)}
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
