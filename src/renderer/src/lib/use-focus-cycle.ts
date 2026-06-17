import { useEffect } from 'react'
import { useAppStore } from '../store/app-store'

/** Major focusable regions of the active page, in cycle order. */
type Region = 'tree' | 'tab' | 'list' | 'payload'

const FLASH_MS = 1000

/** Briefly outline a region in the theme accent color (see .rw-focus-flash). */
function flash(el: Element | null): void {
  if (!(el instanceof HTMLElement)) return
  el.classList.add('rw-focus-flash')
  setTimeout(() => el.classList.remove('rw-focus-flash'), FLASH_MS)
}

/** Focus a region's representative element + flash it. Returns false when the
 * region has nothing to focus (e.g. a queue tab with no messages → no payload). */
function focusRegion(region: Region): boolean {
  switch (region) {
    case 'tree': {
      const el =
        document.querySelector<HTMLElement>('.tree [data-tree-id][tabindex="0"]') ??
        document.querySelector<HTMLElement>('.tree [data-tree-id]')
      if (!el) return false
      el.focus()
      flash(document.querySelector('.tree'))
      return true
    }
    case 'tab': {
      const el =
        document.querySelector<HTMLElement>('.tab.is-active') ??
        document.querySelector<HTMLElement>('.tab')
      if (!el) return false
      el.focus()
      flash(el)
      return true
    }
    case 'list': {
      const el =
        document.querySelector<HTMLElement>('.msg-table tbody tr[tabindex="0"]') ??
        document.querySelector<HTMLElement>('.msg-table tbody tr')
      if (!el) return false
      el.focus()
      flash(document.querySelector('.peek__table-wrap'))
      return true
    }
    case 'payload': {
      const el = document.querySelector<HTMLElement>('.monaco-host textarea')
      if (!el) return false
      el.focus()
      flash(document.querySelector('.msg-detail__editor'))
      return true
    }
  }
}

/** Which region currently holds focus, from document.activeElement. */
function currentRegion(): Region | null {
  const a = document.activeElement
  if (!(a instanceof HTMLElement)) return null
  if (a.closest('.monaco-host')) return 'payload'
  if (a.closest('.msg-table')) return 'list'
  if (a.closest('.tabbar')) return 'tab'
  if (a.closest('.tree')) return 'tree'
  return null
}

/**
 * F6 (Shift+F6 reverse) cycles focus between the page's major regions:
 * tree → tab → message list → payload → tree. The list + payload stops only
 * exist on a queue tab; empty regions are skipped. The newly-focused region gets
 * a brief accent outline.
 */
export function useFocusCycle(): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'F6') return
      e.preventDefault()
      const s = useAppStore.getState()
      const active = s.tabs.find((t) => t.id === s.activeTabId) ?? null
      const regions: Region[] = []
      if (s.sidebarVisible) regions.push('tree')
      regions.push('tab')
      if (active?.kind === 'queue') regions.push('list', 'payload')
      if (regions.length === 0) return

      const step = e.shiftKey ? -1 : 1
      const curIdx = (() => {
        const r = currentRegion()
        return r ? regions.indexOf(r) : -1
      })()

      // Build the ordered candidates to try (skipping empty regions).
      const order: Region[] = []
      if (curIdx === -1) {
        order.push(...(step === 1 ? regions : [...regions].reverse()))
      } else {
        for (let n = 1; n <= regions.length; n++) {
          const i = (((curIdx + step * n) % regions.length) + regions.length) % regions.length
          order.push(regions[i])
        }
      }
      for (const r of order) if (focusRegion(r)) break
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
