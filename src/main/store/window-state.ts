import { screen, type BrowserWindow } from 'electron'
import Store from 'electron-store'

/**
 * Remembers the main window's geometry + state between sessions. Persisted to its
 * own electron-store file (`window-state.json` in userData), mirroring
 * `config-store`. Geometry is captured from `getNormalBounds()` so a maximized /
 * fullscreen window still restores to a sensible size when un-maximized.
 */
interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
  fullscreen?: boolean
}

const DEFAULTS: WindowState = { width: 1280, height: 800 }
const MIN_WIDTH = 900
const MIN_HEIGHT = 600

const store = new Store<{ window: WindowState }>({
  name: 'window-state',
  defaults: { window: DEFAULTS }
})

/** True if the rect overlaps a connected display's work area — guards against
 * restoring onto a monitor that's since been unplugged. */
function isOnScreen(x: number, y: number, width: number, height: number): boolean {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return x < a.x + a.width && x + width > a.x && y < a.y + a.height && y + height > a.y
  })
}

/** BrowserWindow geometry options for the saved (or default) window. Position is
 * omitted (so the window centers) when it would be off-screen. */
export function savedWindowOptions(): { width: number; height: number; x?: number; y?: number } {
  const s = { ...DEFAULTS, ...store.get('window') }
  const width = Math.max(MIN_WIDTH, Math.round(s.width))
  const height = Math.max(MIN_HEIGHT, Math.round(s.height))
  if (s.x != null && s.y != null && isOnScreen(s.x, s.y, width, height)) {
    return { width, height, x: Math.round(s.x), y: Math.round(s.y) }
  }
  return { width, height }
}

/** Saved maximize / fullscreen flags, applied after the window is created. */
export function savedWindowFlags(): { maximized: boolean; fullscreen: boolean } {
  const s = store.get('window')
  return { maximized: Boolean(s.maximized), fullscreen: Boolean(s.fullscreen) }
}

/** Persist the window's geometry + state — debounced on resize/move, flushed on
 * close — so it survives a normal quit or a crash. */
export function trackWindowState(win: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const save = (): void => {
    if (win.isDestroyed()) return
    const b = win.getNormalBounds()
    store.set('window', {
      width: b.width,
      height: b.height,
      x: b.x,
      y: b.y,
      maximized: win.isMaximized(),
      fullscreen: win.isFullScreen()
    })
  }
  const debounced = (): void => {
    clearTimeout(timer)
    timer = setTimeout(save, 400)
  }
  win.on('resize', debounced)
  win.on('move', debounced)
  win.on('close', () => {
    clearTimeout(timer)
    save()
  })
}
