import { useAppStore, type EditorTab, type AdminSection } from '../store/app-store'
import { UsersSection } from './UsersSection'

type AdminTab = Extract<EditorTab, { kind: 'admin' }>

/** Sections of the Administration tab. Grows as later PRs land Vhosts / Permissions. */
const SECTIONS: { key: AdminSection; label: string; icon: string }[] = [
  { key: 'users', label: 'Users', icon: 'codicon-person' }
]

/**
 * Per-cluster Administration tab — the identity/access surface (users, and later
 * vhosts + permissions). Cluster-wide, so it ignores the connection's vhost. Gated
 * on the connected user's `administrator` tag: a non-admin sees a banner, not a 403.
 */
export function AdministrationView({ tab }: { tab: AdminTab }) {
  const refreshTab = useAppStore((s) => s.refreshTab)
  const setAdminSection = useAppStore((s) => s.setAdminSection)
  const { currentUser, error } = tab
  const isAdmin = currentUser?.isAdministrator === true

  return (
    <div className="editor">
      <div className="editor__header">
        <h2>
          <span className="codicon codicon-organization" />
          {tab.title}
        </h2>
        <span className="spacer" />
        {currentUser && (
          <span className="admin-identity" title="The broker user this connection authenticates as">
            <span className="codicon codicon-account" />
            {currentUser.name}
            {currentUser.tags.length > 0 && ` · ${currentUser.tags.join(', ')}`}
          </span>
        )}
        <button className="btn btn--sm btn--secondary" onClick={() => void refreshTab(tab.id)}>
          <span className="codicon codicon-refresh" />
          Refresh
        </button>
      </div>

      {currentUser && !isAdmin ? (
        <div className="editor__body" style={{ padding: 16, overflow: 'auto' }}>
          <div className="notice">
            <p>
              <span className="codicon codicon-warning" /> Administration needs the{' '}
              <b>administrator</b> tag.
            </p>
            <p style={{ color: 'var(--text-muted)' }}>
              You’re connected as “{currentUser.name}”
              {currentUser.tags.length ? ` (${currentUser.tags.join(', ')})` : ' (no tags)'}. Connect
              with an administrator user to manage users, virtual hosts and permissions.
            </p>
          </div>
        </div>
      ) : (
        <>
          {SECTIONS.length > 1 && (
            <div className="admin-sections" role="tablist">
              {SECTIONS.map((s) => (
                <button
                  key={s.key}
                  role="tab"
                  aria-selected={tab.section === s.key}
                  className={`admin-section-tab ${tab.section === s.key ? 'is-active' : ''}`}
                  onClick={() => setAdminSection(tab.connectionId, s.key)}
                >
                  <span className={`codicon ${s.icon}`} />
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <div className="editor__body" style={{ padding: 16, overflow: 'auto' }}>
            {error && <div className="modal__error" style={{ marginBottom: 12 }}>{error}</div>}
            {tab.section === 'users' && <UsersSection tab={tab} />}
          </div>
        </>
      )}
    </div>
  )
}
