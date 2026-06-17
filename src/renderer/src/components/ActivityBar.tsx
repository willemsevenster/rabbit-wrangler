import { useAppStore } from '../store/app-store'

/** VSCode-style activity bar. Connections is the only view for now; the gear opens Settings. */
export function ActivityBar() {
  const openSettings = useAppStore((s) => s.openSettings)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  return (
    <div className="activitybar">
      <button className="activitybar__item is-active" title="Connections">
        <span className="codicon codicon-server-environment" />
      </button>
      <div className="activitybar__spacer" />
      <button
        className={`activitybar__item ${settingsOpen ? 'is-active' : ''}`}
        title="Settings"
        onClick={openSettings}
      >
        <span className="codicon codicon-settings-gear" />
      </button>
    </div>
  )
}
