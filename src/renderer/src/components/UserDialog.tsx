import { useEffect, useState } from 'react'
import { useAppStore, adminTabId } from '../store/app-store'
import type { CreateUserRequest, UserTag } from '@shared/types'

/** The user tags RabbitMQ understands, offered as toggle chips. */
const TAGS: { tag: UserTag; hint: string }[] = [
  { tag: 'administrator', hint: 'Full management access' },
  { tag: 'monitoring', hint: 'Read cluster/node metrics' },
  { tag: 'policymaker', hint: 'Manage policies & parameters' },
  { tag: 'management', hint: 'Basic management UI access' },
  { tag: 'impersonator', hint: 'Publish/consume as other users' }
]

/** Create or update a broker user (`PUT /users/{name}`): name + tags + password.
 * On edit the name is read-only and a blank password keeps the existing one. */
export function UserDialog() {
  const dialog = useAppStore((s) => s.userDialog)
  const connectionId = dialog?.connectionId ?? null
  const editing = dialog?.editing
  const close = useAppStore((s) => s.closeUserDialog)
  const createUser = useAppStore((s) => s.createUser)
  const confirm = useAppStore((s) => s.confirm)
  // The connected user, for the self-lockout guard (from the admin tab).
  const currentUser = useAppStore((s) => {
    const t = s.tabs.find((x) => x.id === (connectionId ? adminTabId(connectionId) : ''))
    return t?.kind === 'admin' ? t.currentUser : null
  })

  const [name, setName] = useState(editing?.name ?? '')
  const [tags, setTags] = useState<string[]>(editing?.tags ?? [])
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const trimmed = name.trim()

  function toggleTag(tag: string): void {
    setTags((ts) => (ts.includes(tag) ? ts.filter((t) => t !== tag) : [...ts, tag]))
  }

  async function submit(): Promise<void> {
    if (!connectionId) return
    if (!trimmed) {
      setError('Provide a user name.')
      return
    }
    // Self-lockout guard: removing your own administrator tag revokes your access.
    if (
      editing &&
      currentUser?.name === editing.name &&
      editing.tags.includes('administrator') &&
      !tags.includes('administrator')
    ) {
      const ok = await confirm({
        title: 'Remove your own admin access?',
        message: `You're connected as "${editing.name}". Removing the administrator tag revokes your admin access in this app.`,
        confirmLabel: 'Remove anyway',
        danger: true
      })
      if (!ok) return
    }
    setBusy(true)
    setError('')
    const req: CreateUserRequest = { connectionId, name: trimmed, tags }
    if (password) req.password = password
    else if (editing) req.keepPassword = true // tag-only edit: main re-asserts the existing hash
    const result = await createUser(req)
    if (!result.ok) {
      setError(result.error ?? 'Save failed.')
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="modal">
        <div className="modal__header">{editing ? 'Edit user' : 'Create user'}</div>
        <div className="modal__body">
          <div className="field">
            <label htmlFor="user-name">Name</label>
            <input
              id="user-name"
              type="text"
              autoFocus={!editing}
              value={name}
              disabled={!!editing}
              onChange={(e) => setName(e.target.value)}
              placeholder="service-account"
            />
          </div>

          <div className="field">
            <label htmlFor="user-pass">Password</label>
            <input
              id="user-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                editing ? '•••••• (unchanged — type to replace)' : '(blank = passwordless)'
              }
            />
          </div>

          <div className="field">
            <label>Tags</label>
            <div className="tag-chips">
              {TAGS.map(({ tag, hint }) => (
                <button
                  key={tag}
                  type="button"
                  className={`tag-chip ${tags.includes(tag) ? 'is-on' : ''}`}
                  title={hint}
                  aria-pressed={tags.includes(tag)}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>
              No tags = a regular user (can connect + use messaging, but has no management access).
            </span>
          </div>

          {error && <div className="modal__error">{error}</div>}
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={close}>
            Cancel
          </button>
          <button className="btn" onClick={() => void submit()} disabled={busy || !trimmed}>
            {busy ? 'Saving…' : editing ? 'Save user' : 'Create user'}
          </button>
        </div>
      </div>
    </div>
  )
}
