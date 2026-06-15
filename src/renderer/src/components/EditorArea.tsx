import { useAppStore } from '../store/app-store'
import { QueueTable } from './QueueTable'
import { MessagePeekPanel } from './MessagePeekPanel'
import { ExchangeDetail } from './ExchangeDetail'

/** Central editor pane: routes between welcome, overview, queue detail and exchange detail. */
export function EditorArea() {
  const selectedId = useAppStore((s) => s.selectedConnectionId)
  const selectedQueue = useAppStore((s) => s.selectedQueue)
  const selectedExchange = useAppStore((s) => s.selectedExchange)
  const connections = useAppStore((s) => s.connections)
  const refreshQueues = useAppStore((s) => s.refreshQueues)

  if (!selectedId) return <Welcome />
  if (selectedExchange !== null) return <ExchangeDetail exchangeName={selectedExchange} />

  const conn = connections.find((c) => c.id === selectedId)

  if (!selectedQueue) {
    return (
      <div className="editor">
        <div className="editor__header">
          <h2>
            <span className="codicon codicon-database" />
            {conn?.name} · Queues
          </h2>
          <span className="spacer" />
          <button className="btn btn--sm btn--secondary" onClick={() => void refreshQueues()}>
            <span className="codicon codicon-refresh" />
            Refresh
          </button>
        </div>
        <div className="editor__body">
          <QueueTable />
        </div>
      </div>
    )
  }

  return <QueueDetail queue={selectedQueue} />
}

function QueueDetail({ queue }: { queue: string }) {
  const purgeQueue = useAppStore((s) => s.purgeQueue)

  async function purge() {
    if (!confirm(`Purge all messages from "${queue}"? This cannot be undone.`)) return
    const result = await purgeQueue(queue)
    if (!result.ok) alert(`Purge failed: ${result.error ?? 'unknown error'}`)
  }

  return (
    <div className="editor">
      <div className="editor__header">
        <h2>
          <span className="codicon codicon-inbox" />
          {queue}
        </h2>
        <span className="spacer" />
        <button className="btn btn--sm btn--danger" onClick={() => void purge()}>
          <span className="codicon codicon-trash" />
          Purge
        </button>
      </div>
      <div className="editor__body" style={{ display: 'flex', flexDirection: 'column' }}>
        <MessagePeekPanel />
      </div>
    </div>
  )
}

function Welcome() {
  const openNew = useAppStore((s) => s.openNewConnection)
  return (
    <div className="editor">
      <div className="welcome">
        <h1>🐰 Rabbit Wrangler</h1>
        <p>
          Peek messages, move dead-letters and purge queues across your RabbitMQ clusters.
        </p>
        <p>Add a connection to get started.</p>
        <button className="btn" onClick={openNew} style={{ marginTop: 8 }}>
          <span className="codicon codicon-add" style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Add Connection
        </button>
      </div>
    </div>
  )
}
