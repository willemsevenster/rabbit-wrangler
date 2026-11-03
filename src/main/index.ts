import { app, shell, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { eventStreamServer } from './websocket-server'
import { connectionManager } from './connections/connection-manager'
import { initUpdater, disposeUpdater } from './updater'
import {
  savedWindowOptions,
  savedWindowFlags,
  trackWindowState,
  MIN_WIDTH,
  MIN_HEIGHT
} from './store/window-state'
import { startupBackgroundColor, startupTitleBarOverlay } from './store/ui-prefs'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    ...savedWindowOptions(),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    // Paint the window in the theme's background up-front so a dark-mode user
    // doesn't get a white flash before the renderer's CSS loads (and vice-versa).
    backgroundColor: startupBackgroundColor(),
    title: 'Rabbit Wrangler',
    // Dev taskbar/window icon. Packaged builds get their icon from the executable
    // (electron-builder embeds build/icon.* there), so this is only needed in dev.
    ...(is.dev ? { icon: join(import.meta.dirname, '../../build/icon.png') } : {}),
    // VSCode-style chrome: hide the OS title bar but keep the native window
    // controls (min/max/close) drawn in an overlay so we don't reimplement them.
    titleBarStyle: 'hidden',
    // Native min/max/close overlay, themed to match the title bar (updated live on
    // theme change via the persistTheme IPC handler). macOS uses traffic lights.
    titleBarOverlay: process.platform === 'darwin' ? false : startupTitleBarOverlay(),
    webPreferences: {
      // CommonJS on purpose: a sandboxed preload can't be an ES module.
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true
    }
  })

  // Restore maximize/fullscreen, then keep the saved geometry up to date.
  const flags = savedWindowFlags()
  if (flags.fullscreen) mainWindow.setFullScreen(true)
  else if (flags.maximized) mainWindow.maximize()
  trackWindowState(mainWindow)

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // window.open (Help links, Ctrl+click on a link in a Monaco payload) never opens
  // an Electron window. Only https:// URLs go to the OS browser — a message
  // payload is untrusted, and file://, UNC or custom-protocol links must not be
  // launched from it.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isExternalSafe(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  // The app is a single page; never let the window itself navigate elsewhere.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault()
  })

  // electron-vite injects the dev server URL in development and the built
  // index.html path in production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

function isExternalSafe(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.frontforge.rabbitwrangler')

  // No native menu bar — the app provides its own VSCode-style menu in the title bar.
  Menu.setApplicationMenu(null)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await eventStreamServer.start()
  registerIpcHandlers()
  createWindow()
  initUpdater() // checks GitHub Releases for updates (no-op in dev)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  disposeUpdater()
  await connectionManager.disposeAll()
  await eventStreamServer.stop()
})
