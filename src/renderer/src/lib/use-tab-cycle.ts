import { useEffect } from 'react'
import { useAppStore } from '../store/app-store'

/**
 * Ctrl+Tab / Ctrl+Shift+Tab cycle the active editor tab forward / backward,
 * wrapping at both ends. Listens in the capture phase so the keystroke wins even
 * when focus is inside Monaco (whose own keybindings would otherwise swallow it).
 */
export function useTabCycle(): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!e.ctrlKey || e.key !== 'Tab') return
      const { tabs, activeTabId, setActiveTab } = useAppStore.getState()
      if (tabs.length < 2) return
      e.preventDefault()
      const idx = tabs.findIndex((t) => t.id === activeTabId)
      const from = idx === -1 ? 0 : idx
      const next = (from + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length
      setActiveTab(tabs[next].id)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
