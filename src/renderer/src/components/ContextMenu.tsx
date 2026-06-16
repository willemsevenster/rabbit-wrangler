import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

export interface MenuItem {
  label?: string
  /** codicon name without the `codicon-` prefix. */
  icon?: string
  /** Optional right-aligned badge (e.g. an unread count). */
  badge?: string
  /** Native tooltip — useful when the label is ellipsized. */
  title?: string
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  separator?: boolean
}

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

/** Manages context-menu open state + cursor positioning (clamped to viewport). */
export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null)
  function openMenu(e: ReactMouseEvent, items: MenuItem[]) {
    e.preventDefault()
    e.stopPropagation()
    const width = 340
    const height = items.length * 28 + 8
    setMenu({
      x: Math.max(4, Math.min(e.clientX, window.innerWidth - width - 4)),
      y: Math.max(4, Math.min(e.clientY, window.innerHeight - height - 4)),
      items
    })
  }
  return { menu, openMenu, close: () => setMenu(null) }
}

/** A lightweight VSCode-style context menu positioned at (x, y). */
export function ContextMenu({ x, y, items, onClose }: MenuState & { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('contextmenu', onPointer)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('contextmenu', onPointer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  return (
    <div ref={ref} className="context-menu" style={{ left: x, top: y }} role="menu">
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="context-menu__sep" />
        ) : (
          <button
            key={i}
            className={`context-menu__item ${item.danger ? 'is-danger' : ''}`}
            disabled={item.disabled}
            role="menuitem"
            onClick={() => {
              onClose()
              item.onClick?.()
            }}
          >
            <span className="context-menu__icon">
              {item.icon && <span className={`codicon codicon-${item.icon}`} />}
            </span>
            <span className="context-menu__label" title={item.title}>
              {item.label}
            </span>
            {item.badge != null && <span className="context-menu__badge">{item.badge}</span>}
          </button>
        )
      )}
    </div>
  )
}
