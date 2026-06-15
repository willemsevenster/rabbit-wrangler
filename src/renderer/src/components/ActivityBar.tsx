/** VSCode-style activity bar. Connections is the only view for now. */
export function ActivityBar() {
  return (
    <div className="activitybar">
      <button className="activitybar__item is-active" title="Connections">
        <span className="codicon codicon-server-environment" />
      </button>
      <div className="activitybar__spacer" />
      <button className="activitybar__item" title="Settings">
        <span className="codicon codicon-settings-gear" />
      </button>
    </div>
  )
}
