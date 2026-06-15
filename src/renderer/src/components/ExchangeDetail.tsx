import { useAppStore } from '../store/app-store'
import { ExchangeDiagram } from './ExchangeDiagram'

/** Editor view for a selected exchange: bindings (read-only) + diagram + actions. */
export function ExchangeDetail({ exchangeName }: { exchangeName: string }) {
  const exchanges = useAppStore((s) => s.exchanges)
  const bindings = useAppStore((s) => s.bindings)
  const openPublish = useAppStore((s) => s.openPublishDialog)
  const del = useAppStore((s) => s.deleteExchange)

  const x = exchanges.find((e) => e.name === exchangeName)
  const label = exchangeName === '' ? '(AMQP default)' : exchangeName
  const isBuiltIn = exchangeName === '' || exchangeName.startsWith('amq.')

  async function onDelete() {
    if (!confirm(`Delete exchange "${exchangeName}"? This cannot be undone.`)) return
    const result = await del(exchangeName)
    if (!result.ok) alert(`Delete failed: ${result.error ?? 'unknown error'}`)
  }

  return (
    <div className="editor">
      <div className="editor__header">
        <h2>
          <span className="codicon codicon-symbol-namespace" />
          {label}
        </h2>
        {x && <span className="badge">{x.type}</span>}
        {x?.durable && <span className="badge">durable</span>}
        {x?.internal && <span className="badge">internal</span>}
        <span className="spacer" />
        <button className="btn btn--sm btn--secondary" onClick={() => openPublish(exchangeName)}>
          <span className="codicon codicon-arrow-right" />
          Publish
        </button>
        <button
          className="btn btn--sm btn--danger"
          disabled={isBuiltIn}
          title={isBuiltIn ? 'Built-in exchanges cannot be deleted' : undefined}
          onClick={() => void onDelete()}
        >
          <span className="codicon codicon-trash" />
          Delete
        </button>
      </div>
      <div className="editor__body" style={{ padding: 16, overflow: 'auto' }}>
        <h3 className="section-title">Bindings</h3>
        {bindings.length === 0 ? (
          <p className="placeholder" style={{ padding: 0 }}>
            No bindings.
            {exchangeName === '' && ' The default exchange binds every queue implicitly by name.'}
          </p>
        ) : (
          <table className="queue-table" style={{ maxWidth: 720 }}>
            <thead>
              <tr>
                <th>Destination</th>
                <th>Type</th>
                <th>Routing key</th>
              </tr>
            </thead>
            <tbody>
              {bindings.map((b, i) => (
                <tr key={i}>
                  <td>{b.destination}</td>
                  <td>{b.destinationType}</td>
                  <td>
                    <code>{b.routingKey || '(none)'}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 className="section-title" style={{ marginTop: 24 }}>
          Diagram
        </h3>
        <ExchangeDiagram exchangeName={exchangeName} bindings={bindings} />
      </div>
    </div>
  )
}
