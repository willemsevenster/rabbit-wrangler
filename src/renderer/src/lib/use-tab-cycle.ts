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
      // Exactly Ctrl(+Shift)+Tab — ignore when Alt/Meta are also held so we don't
      // hijack other chords (e.g. Ctrl+Alt+Tab).
      if (!e.ctrlKey || e.altKey || e.metaKey || e.key !== 'Tab') return
      const { tabs, activeTabId, setActiveTab } = useAppStore.getState()
      if (tabs.length < 2) return
      e.preventDefault()
      const idx = tabs.findIndex((t) => t.id === activeTabId)
      // With no active tab, forward starts at the first tab and reverse at the last.
      const next =
        idx === -1
          ? e.shiftKey
            ? tabs.length - 1
            : 0
          : (idx + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length
      setActiveTab(tabs[next].id)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
