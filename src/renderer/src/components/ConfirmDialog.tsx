import { useEffect } from 'react'
import { useAppStore } from '../store/app-store'

/**
 * Themed replacement for window.confirm(). Driven by `confirmRequest` in the
 * store; the store's `confirm()` returns a promise that resolves on the user's
 * choice. Enter confirms, Escape / overlay click / Cancel rejects.
 */
export function ConfirmDialog() {
  const req = useAppStore((s) => s.confirmRequest)
  const resolve = useAppStore((s) => s.resolveConfirm)

  useEffect(() => {
    if (!req) return
    // Escape cancels. Enter is intentionally NOT bound globally — the confirm
    // button is autofocused, so Enter activates whichever button has focus
    // (pressing Enter on a tabbed-to Cancel must cancel, not confirm).
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') resolve(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [req, resolve])

  if (!req) return null
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) resolve(false)
      }}
    >
      <div className="modal modal--confirm">
        <div className="modal__header">{req.title}</div>
        <div className="modal__body">
          <p className="confirm__message">{req.message}</p>
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={() => resolve(false)}>
            Cancel
          </button>
          <button className={`btn ${req.danger ? 'btn--danger' : ''}`} autoFocus onClick={() => resolve(true)}>
            {req.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
