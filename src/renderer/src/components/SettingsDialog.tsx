import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useAppStore } from '../store/app-store'
import { DEFAULT_DLQ_SUFFIXES } from '../lib/dlq'
import { openManual } from '../lib/help'
import type { UpdateStatusPayload } from '@shared/ipc'

/** One-line summary of the current update status for the Settings → Updates row. */
function updateSummary(s: UpdateStatusPayload | null): string {
  if (!s) return 'Updates are checked automatically in the background.'
  switch (s.state) {
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return `Update available${s.version ? `: v${s.version}` : ''}.`
    case 'none':
      return "You're on the latest version."
    case 'downloading':
      return `Downloading… ${s.percent ?? 0}%`
    case 'downloaded':
      return `Update ready${s.version ? `: v${s.version}` : ''} — restart to install.`
    case 'error':
      return `Update error: ${s.error ?? 'unknown error'}`
  }
}

/**
 * Settings modal (opened by the activity-bar gear or View → Settings). Mirrors the
 * About/Confirm modal pattern — driven by `settingsOpen` in the store. All values
 * persist via the store (localStorage, plus IPC for the main-owned auto-download).
 * The body is a child that only mounts while open, so its local input buffers
 * initialize fresh from the store on each open (no sync effect needed).
 */
export function SettingsDialog() {
  const open = useAppStore((s) => s.settingsOpen)
  return open ? <SettingsModal /> : null
}

function SettingsModal() {
  const close = useAppStore((s) => s.closeSettings)

  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const maxMessages = useAppStore((s) => s.maxMessages)
  const setMaxMessages = useAppStore((s) => s.setMaxMessages)
  const dlqSuffixes = useAppStore((s) => s.dlqSuffixes)
  const setDlqSuffixes = useAppStore((s) => s.setDlqSuffixes)
  const confirmDestructive = useAppStore((s) => s.confirmDestructive)
  const setConfirmDestructive = useAppStore((s) => s.setConfirmDestructive)
  const autoConnectOnLaunch = useAppStore((s) => s.autoConnectOnLaunch)
  const setAutoConnectOnLaunch = useAppStore((s) => s.setAutoConnectOnLaunch)
  const autoDownloadUpdates = useAppStore((s) => s.autoDownloadUpdates)
  const setAutoDownloadUpdates = useAppStore((s) => s.setAutoDownloadUpdates)
  const updateStatus = useAppStore((s) => s.updateStatus)
  const checkForUpdates = useAppStore((s) => s.checkForUpdates)
  const downloadUpdate = useAppStore((s) => s.downloadUpdate)
  const restartToUpdate = useAppStore((s) => s.restartToUpdate)

  // Local input buffers so partial typing isn't clobbered by clamping on every keystroke.
  const [maxInput, setMaxInput] = useState(String(maxMessages))
  const [newSuffix, setNewSuffix] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  function commitMax(): void {
    const n = Number(maxInput)
    setMaxMessages(Number.isFinite(n) && n > 0 ? n : maxMessages)
    // Reflect the clamped value the store settled on.
    setMaxInput(String(useAppStore.getState().maxMessages))
  }

  function addSuffix(): void {
    const v = newSuffix.trim()
    if (!v) return
    setDlqSuffixes([...dlqSuffixes, v])
    setNewSuffix('')
  }

  function onSuffixKey(e: ReactKeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      addSuffix()
    }
  }

  const updateState = updateStatus?.state

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="modal modal--wide">
        <div className="modal__header modal__header--row">
          <span>Settings</span>
          <button
            className="icon-button"
            title="Open the Settings manual"
            onClick={() => openManual('settings')}
          >
            <span className="codicon codicon-question" />
          </button>
        </div>
        <div className="modal__body settings">
          {/* Appearance */}
          <section className="settings__section">
            <div className="settings__section-title">Appearance</div>
            <div className="field field--row">
              <label>Theme</label>
              <div className="seg">
                <button
                  className={`seg__btn ${theme === 'light' ? 'is-active' : ''}`}
                  onClick={() => setTheme('light')}
                >
                  <span className="codicon codicon-color-mode" /> Light
                </button>
                <button
                  className={`seg__btn ${theme === 'dark' ? 'is-active' : ''}`}
                  onClick={() => setTheme('dark')}
                >
                  <span className="codicon codicon-color-mode" /> Dark
                </button>
              </div>
            </div>
          </section>

          {/* Messages */}
          <section className="settings__section">
            <div className="settings__section-title">Messages</div>
            <div className="field field--row">
              <label htmlFor="set-max">Max messages to show</label>
              <input
                id="set-max"
                type="number"
                min={10}
                max={9999}
                value={maxInput}
                onChange={(e) => setMaxInput(e.target.value)}
                onBlur={commitMax}
                onKeyDown={(e) => e.key === 'Enter' && commitMax()}
                style={{ width: 96 }}
              />
            </div>
            <p className="settings__hint">
              Per queue tab. Oldest messages drop off once the cap is reached (10–9,999).
            </p>
            <label className="field--check">
              <input
                type="checkbox"
                checked={confirmDestructive}
                onChange={(e) => setConfirmDestructive(e.target.checked)}
              />
              Confirm before destructive actions (purge / delete)
            </label>
          </section>

          {/* Dead-letter queues */}
          <section className="settings__section">
            <div className="settings__section-title">Dead-letter queues</div>
            <p className="settings__hint">
              A queue is flagged as a DLQ when its name ends with any of these suffixes.
            </p>
            <div className="chips">
              {dlqSuffixes.map((s) => (
                <span className="chip" key={s}>
                  {s}
                  <button
                    className="chip__remove"
                    title={`Remove "${s}"`}
                    aria-label={`Remove ${s}`}
                    onClick={() => setDlqSuffixes(dlqSuffixes.filter((x) => x !== s))}
                  >
                    <span className="codicon codicon-close" />
                  </button>
                </span>
              ))}
            </div>
            <div className="field field--row" style={{ marginTop: 8 }}>
              <input
                id="dlq-suffix-input"
                type="text"
                placeholder="e.g. _failed"
                value={newSuffix}
                onChange={(e) => setNewSuffix(e.target.value)}
                onKeyDown={onSuffixKey}
              />
              <button className="btn btn--sm btn--secondary" onClick={addSuffix} disabled={!newSuffix.trim()}>
                Add
              </button>
              <button
                className="btn btn--sm btn--secondary"
                onClick={() => setDlqSuffixes([...DEFAULT_DLQ_SUFFIXES])}
              >
                Reset to defaults
              </button>
            </div>
          </section>

          {/* Updates */}
          <section className="settings__section">
            <div className="settings__section-title">Updates</div>
            <div className="settings__update-status">{updateSummary(updateStatus)}</div>
            <div className="field field--row" style={{ marginTop: 8 }}>
              <button className="btn btn--sm btn--secondary" onClick={checkForUpdates}>
                <span className="codicon codicon-cloud" /> Check for updates
              </button>
              {updateState === 'available' && (
                <button className="btn btn--sm" onClick={downloadUpdate}>
                  <span className="codicon codicon-cloud-download" /> Download
                </button>
              )}
              {updateState === 'downloaded' && (
                <button className="btn btn--sm" onClick={() => void restartToUpdate()}>
                  <span className="codicon codicon-debug-restart" /> Restart to update
                </button>
              )}
            </div>
            <label className="field--check">
              <input
                type="checkbox"
                checked={autoDownloadUpdates}
                onChange={(e) => setAutoDownloadUpdates(e.target.checked)}
              />
              Download updates automatically
            </label>
          </section>

          {/* Connections */}
          <section className="settings__section">
            <div className="settings__section-title">Connections</div>
            <label className="field--check">
              <input
                type="checkbox"
                checked={autoConnectOnLaunch}
                onChange={(e) => setAutoConnectOnLaunch(e.target.checked)}
              />
              Connect saved clusters automatically on launch
            </label>
          </section>
        </div>
        <div className="modal__footer">
          <button className="btn" autoFocus onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
