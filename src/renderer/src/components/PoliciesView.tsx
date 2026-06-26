import { useAppStore, type EditorTab } from '../store/app-store'
import type { PolicyInfo } from '@shared/types'

type PoliciesTab = Extract<EditorTab, { kind: 'policies' }>

/** Editor tab listing a vhost's policies, with add / edit / delete. Policies are
 * the config side of dead-lettering — set a DLX, message-TTL or max-length by name
 * pattern without leaving the app. */
export function PoliciesView({ tab }: { tab: PoliciesTab }) {
  const refreshTab = useAppStore((s) => s.refreshTab)
  const openPolicyDialog = useAppStore((s) => s.openPolicyDialog)
  const deletePolicy = useAppStore((s) => s.deletePolicy)
  const maybeConfirm = useAppStore((s) => s.maybeConfirm)

  const policies = tab.policies

  async function onDelete(p: PolicyInfo): Promise<void> {
    const ok = await maybeConfirm({
      title: 'Delete policy',
      message: `Delete policy "${p.name}"? Queues/exchanges matching "${p.pattern}" will lose its settings.`,
      confirmLabel: 'Delete',
      danger: true
    })
    if (!ok) return
    await deletePolicy(tab.connectionId, p.name)
  }

  return (
    <div className="editor">
      <div className="editor__header">
        <h2>
          <span className="codicon codicon-law" />
          {tab.title}
        </h2>
        <span className="spacer" />
        <button
          className="btn btn--sm"
          onClick={() => openPolicyDialog(tab.connectionId)}
        >
          <span className="codicon codicon-add" />
          Add Policy
        </button>
        <button className="btn btn--sm btn--secondary" onClick={() => void refreshTab(tab.id)}>
          <span className="codicon codicon-refresh" />
          Refresh
        </button>
      </div>
      <div className="editor__body" style={{ padding: 16, overflow: 'auto' }}>
        {policies.length === 0 ? (
          <p className="placeholder" style={{ padding: 0 }}>
            No policies on this virtual host.
          </p>
        ) : (
          <table className="queue-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Pattern</th>
                <th>Apply to</th>
                <th>Definition</th>
                <th className="num">Priority</th>
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>
                    <code>{p.pattern}</code>
                  </td>
                  <td>{p.applyTo}</td>
                  <td>
                    <code>{JSON.stringify(p.definition)}</code>
                  </td>
                  <td className="num">{p.priority}</td>
                  <td className="policy-actions">
                    <button
                      className="icon-button"
                      title="Edit policy"
                      onClick={() => openPolicyDialog(tab.connectionId, p)}
                    >
                      <span className="codicon codicon-edit" />
                    </button>
                    <button
                      className="icon-button"
                      title="Delete policy"
                      onClick={() => void onDelete(p)}
                    >
                      <span className="codicon codicon-trash" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
