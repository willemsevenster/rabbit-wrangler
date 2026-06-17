import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'

/** Themed About dialog (replaces the native alert). Shows the app version. */
export function AboutDialog() {
  const open = useAppStore((s) => s.aboutOpen)
  const close = useAppStore((s) => s.closeAbout)
  const [version, setVersion] = useState('')

  useEffect(() => {
    if (open) void window.api.getAppVersion().then(setVersion)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="modal modal--about">
        <div className="modal__body">
          <div className="about">
            <span className="about__icon">🐰</span>
            <div className="about__name">Rabbit Wrangler</div>
            <div className="about__version">{version ? `Version ${version}` : '…'}</div>
            <div className="about__desc">RabbitMQ management tool</div>
          </div>
        </div>
        <div className="modal__footer">
          <button className="btn" autoFocus onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
