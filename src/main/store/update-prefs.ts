import Store from 'electron-store'

/**
 * Main-process record of update preferences. Currently just `autoDownload`: when
 * on, electron-updater downloads an available update automatically instead of
 * waiting for the user to click the title-bar Update button. Persisted here (not
 * in the renderer) because the updater reads it at launch, before the renderer
 * runs. The renderer mirrors it in the Settings dialog over IPC.
 */
const store = new Store<{ autoDownload?: boolean }>({ name: 'update-prefs', defaults: {} })

export function getAutoDownload(): boolean {
  return store.get('autoDownload') === true
}

export function setAutoDownload(enabled: boolean): void {
  store.set('autoDownload', !!enabled)
}
