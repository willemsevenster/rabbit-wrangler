import { useEffect, useRef, useState } from 'react'

/**
 * A "?" help trigger that opens a click-to-persist popover (so the text can be
 * selected/copied). Closes on outside click or Escape. Positioned fixed off the
 * trigger so it isn't clipped by scrolling/overflow containers.
 */
export function HelpPopover({ text }: { text: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pos) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setPos(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPos(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', () => setPos(null))
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [pos])

  function toggle() {
    if (pos) {
      setPos(null)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = 300
    const x = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
    setPos({ x, y: rect.bottom + 4 })
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="field__hint"
        aria-label="Help"
        onClick={(e) => {
          e.preventDefault()
          toggle()
        }}
      >
        ?
      </button>
      {pos && (
        <div ref={panelRef} className="help-popover" style={{ left: pos.x, top: pos.y }}>
          {text}
        </div>
      )}
    </>
  )
}
