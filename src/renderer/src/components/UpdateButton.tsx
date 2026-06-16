import { useAppStore } from '../store/app-store'

/**
 * Title-bar button surfacing auto-update state. Renders nothing unless an update
 * is available, downloading, or downloaded — so it's invisible in the common case.
 */
export function UpdateButton() {
  const status = useAppStore((s) => s.updateStatus)
  const downloadUpdate = useAppStore((s) => s.downloadUpdate)
  const restartToUpdate = useAppStore((s) => s.restartToUpdate)

  if (!status) return null

  if (status.state === 'available') {
    return (
      <button
        className="btn btn--sm titlebar__update"
        title={`Update available${status.version ? ` (${status.version})` : ''} — click to download`}
        onClick={downloadUpdate}
      >
        <span className="codicon codicon-cloud-download" />
        Update
      </button>
    )
  }

  if (status.state === 'downloading') {
    return (
      <button className="btn btn--sm btn--secondary titlebar__update" disabled>
        <span className="codicon codicon-sync codicon-modifier-spin" />
        Downloading… {status.percent ?? 0}%
      </button>
    )
  }

  if (status.state === 'downloaded') {
    return (
      <button
        className="btn btn--sm titlebar__update"
        title={`Restart to install${status.version ? ` ${status.version}` : ''}`}
        onClick={restartToUpdate}
      >
        <span className="codicon codicon-debug-restart" />
        Restart to update
      </button>
    )
  }

  return null
}
