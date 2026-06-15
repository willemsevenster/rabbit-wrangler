import { type MouseEvent as ReactMouseEvent } from 'react'
import { useAppStore } from '../store/app-store'

/** Width of the activity bar; the sidebar starts after it. */
const ACTIVITY_BAR_WIDTH = 48

/** Drag handle on the sidebar's right edge that resizes it. */
export function Resizer() {
  const width = useAppStore((s) => s.sidebarWidth)
  const setWidth = useAppStore((s) => s.setSidebarWidth)

  function onMouseDown(e: ReactMouseEvent) {
    e.preventDefault()
    const onMove = (ev: MouseEvent) => setWidth(ev.clientX - ACTIVITY_BAR_WIDTH)
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('resizing')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.classList.add('resizing')
  }

  return (
    <div
      className="resizer"
      style={{ left: ACTIVITY_BAR_WIDTH + width }}
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
    />
  )
}
