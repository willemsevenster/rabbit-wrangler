import { app } from 'electron'
import electronUpdater from 'electron-updater'
import log from 'electron-log/main'
import { eventBus } from './event-bus'
import { getAutoDownload, setAutoDownload } from './store/update-prefs'
import type { UpdateStatusPayload } from '@shared/ipc'

// electron-updater is CJS; default-import then destructure so it resolves
// reliably under the ESM main bundle (named ESM imports can break here).
const { autoUpdater } = electronUpdater

const STARTUP_DELAY_MS = 4000
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000

let initialized = false
/** Tags the next check result as user-initiated so the renderer shows feedback. */
let manualCheck = false
let pollTimer: ReturnType<typeof setInterval> | null = null

/** The updater only works in a packaged build — it needs app-update.yml, which
 * electron-builder writes into the package. In dev every call is a no-op. */
const isActive = (): boolean => app.isPackaged

function emit(payload: UpdateStatusPayload): void {
  eventBus.emitStream({ type: 'update-status', payload })
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Configure electron-updater: download only on demand (never auto-download or
 * silently install on quit), push every state change to the renderer over the
 * event bus, and schedule a startup + periodic check.
 */
export function initUpdater(): void {
  if (initialized || !isActive()) return
  initialized = true

  // Auto-download follows the user's persisted preference (default off); install
  // is always manual (the user is prompted to restart).
  autoUpdater.autoDownload = getAutoDownload()
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = log
  log.transports.file.level = 'info'

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking', manual: manualCheck }))
  autoUpdater.on('update-available', (info) =>
    emit({ state: 'available', version: info.version, manual: manualCheck })
  )
  autoUpdater.on('update-not-available', (info) => {
    emit({ state: 'none', version: info.version, manual: manualCheck })
    manualCheck = false
  })
  autoUpdater.on('download-progress', (progress) =>
    emit({ state: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    emit({ state: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (err) => {
    emit({ state: 'error', error: describe(err), manual: manualCheck })
    manualCheck = false
  })

  setTimeout(() => void runCheck(false), STARTUP_DELAY_MS)
  pollTimer = setInterval(() => void runCheck(false), POLL_INTERVAL_MS)
}

async function runCheck(manual: boolean): Promise<void> {
  if (!isActive()) return
  manualCheck = manual
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    emit({ state: 'error', error: describe(err), manual })
    manualCheck = false
  }
}

/** User-initiated check (Help → Check for updates). */
export function checkForUpdates(): Promise<void> {
  // In dev there is no updater; still answer the UI so it can say "up to date".
  if (!isActive()) {
    emit({ state: 'none', manual: true })
    return Promise.resolve()
  }
  return runCheck(true)
}

export async function downloadUpdate(): Promise<void> {
  if (!isActive()) return
  manualCheck = false
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    emit({ state: 'error', error: describe(err) })
  }
}

export function quitAndInstall(): void {
  if (!isActive()) return
  // Defer so the IPC reply flushes before the app quits; relaunch after install.
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
}

/** Whether updates auto-download (read by the Settings dialog). */
export function getAutoDownloadUpdates(): boolean {
  return getAutoDownload()
}

/** Persist the auto-download preference and apply it live to electron-updater. */
export function setAutoDownloadUpdates(enabled: boolean): void {
  setAutoDownload(enabled)
  if (isActive()) autoUpdater.autoDownload = enabled
}

export function disposeUpdater(): void {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}
