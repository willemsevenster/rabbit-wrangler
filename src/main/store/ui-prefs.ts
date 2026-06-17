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

/**
 * Background colour for the window *before* the renderer paints. Uses the
 * remembered theme; on first run (nothing stored yet) it follows the OS — which
 * matches the renderer's first-run behaviour — so the pre-paint frame matches the
 * theme the renderer is about to apply, and there's no flash.
 */
export function startupBackgroundColor(): string {
  const theme = getStoredTheme() ?? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
  return theme === 'light' ? '#ffffff' : '#1e1e1e'
}
