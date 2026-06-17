import { useAppStore } from '../store/app-store'

/**
 * Stacked transient notifications (bottom-center). Toasts auto-dismiss via a
 * timer in the store; clicking one dismisses it early. Replaces the old
 * single-message update banner.
 */
export function Toaster() {
  const toasts = useAppStore((s) => s.toasts)
  const dismiss = useAppStore((s) => s.dismissToast)

  if (toasts.length === 0) return null
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast--${t.kind}`}
          role="status"
          title="Dismiss"
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
