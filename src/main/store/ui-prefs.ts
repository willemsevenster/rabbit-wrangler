import { nativeTheme } from 'electron'
import Store from 'electron-store'

/**
 * Small main-process record of UI preferences the main process needs *before* the
 * renderer runs — currently just the theme, so the window can open with the right
 * background colour and avoid a white flash on launch. The renderer keeps its own
 * `rw.theme` in localStorage (the source of truth for the live UI) and mirrors it
 * here over IPC whenever it changes.
 */
type Theme = 'light' | 'dark'

const store = new Store<{ theme?: Theme }>({ name: 'ui-prefs', defaults: {} })

export function setStoredTheme(theme: Theme): void {
  if (theme === 'light' || theme === 'dark') store.set('theme', theme)
}

function getStoredTheme(): Theme | undefined {
  const t = store.get('theme')
  return t === 'light' || t === 'dark' ? t : undefined
}

/** The theme the window should open with: the remembered choice, else the OS
 * preference (matching the renderer's first-run behaviour). */
function resolveTheme(): Theme {
  return getStoredTheme() ?? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
}

/**
 * Background colour for the window *before* the renderer paints, so the pre-paint
 * frame matches the theme the renderer is about to apply (no white flash).
 */
export function startupBackgroundColor(): string {
  return resolveTheme() === 'light' ? '#ffffff' : '#1e1e1e'
}

/** Native window-control overlay height — matches the 30px title bar (see the
 * .app-shell grid in main.css). Single source so the creation + toggle paths agree. */
const TITLEBAR_OVERLAY_HEIGHT = 30

/** Native window-control overlay (min/max/close) options per theme — colours kept
 * in sync with the title-bar CSS variables (--titlebar-bg / --titlebar-fg). */
export function titleBarOverlay(theme: Theme): {
  color: string
  symbolColor: string
  height: number
} {
  const colors =
    theme === 'light'
      ? { color: '#dddddd', symbolColor: '#333333' }
      : { color: '#323233', symbolColor: '#cccccc' }
  return { ...colors, height: TITLEBAR_OVERLAY_HEIGHT }
}

/** Overlay options for the window at creation, for the resolved theme. */
export function startupTitleBarOverlay(): { color: string; symbolColor: string; height: number } {
  return titleBarOverlay(resolveTheme())
}
