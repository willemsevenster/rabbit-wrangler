import { useEffect } from 'react'
import { useAppStore } from '../store/app-store'

/** Transient bottom banner for manual update-check feedback (auto-dismisses). */
export function UpdateToast() {
  const toast = useAppStore((s) => s.updateToast)
  const dismiss = useAppStore((s) => s.dismissUpdateToast)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(dismiss, 4000)
    return () => clearTimeout(t)
  }, [toast, dismiss])

  if (!toast) return null
  return (
    <div className="update-toast" role="status" onClick={dismiss} title="Dismiss">
      {toast}
    </div>
  )
}
