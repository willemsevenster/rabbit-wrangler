import { useEffect } from 'react'
import { useAppStore } from '../store/app-store'

/**
 * Ctrl+F opens the cross-tab message search popup. Capture phase + preventDefault
 * so it wins over Monaco's in-editor find and there's no native browser find.
 */
export function useSearchHotkey(): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!e.ctrlKey || e.altKey || e.metaKey || (e.key !== 'f' && e.key !== 'F')) return
      e.preventDefault()
      useAppStore.getState().openSearch()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
