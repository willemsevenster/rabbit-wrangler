import { useAppStore, type EditorTab } from '../store/app-store'
import { ExchangeDiagram } from './ExchangeDiagram'

type ExchangeTab = Extract<EditorTab, { kind: 'exchange' }>

/** Editor tab for an exchange: bindings (read-only) + diagram + actions. */
export function ExchangeDetail({ tab }: { tab: ExchangeTab }) {
  const exchangeName = tab.exchange
  const bindings = tab.bindings
  const exchanges = useAppStore((s) => s.exchangesByConn[tab.connectionId] ?? [])
  const openPublish = useAppStore((s) => s.openPublishDialog)
  const openBinding = useAppStore((s) => s.openBindingDialog)
  const deleteBinding = useAppStore((s) => s.deleteBinding)
  const del = useAppStore((s) => s.deleteExchange)
  const confirm = useAppStore((s) => s.confirm)
  const maybeConfirm = useAppStore((s) => s.maybeConfirm)
  const addToast = useAppStore((s) => s.addToast)

  const x = exchanges.find((e) => e.name === exchangeName)
  const label = exchangeName === '' ? '(AMQP default)' : exchangeName
  const isDefault = exchangeName === ''
  const isBuiltIn = isDefault || exchangeName.startsWith('amq.')

  async function onDelete() {
    const ok = await confirm({
      title: 'Delete exchange',
      message: `Delete exchange "${exchangeName}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true
    })
    if (!ok) return
    const result = await del(exchangeName, tab.connectionId)
    if (!result.ok) addToast('error', `Delete failed: ${result.error ?? 'unknown error'}`)
  }

  async function onDeleteBinding(b: (typeof bindings)[number]): Promise<void> {
    // A binding is addressed by its properties key, not its routing key — without
    // it we can't form a valid (or safe) DELETE, so the row's button is disabled.
    if (!b.propertiesKey) return
    const ok = await maybeConfirm({
      title: 'Remove binding',
      message: `Remove the binding to ${b.destinationType} "${b.destination}"${
        b.routingKey ? ` (routing key "${b.routingKey}")` : ''
      }?`,
      confirmLabel: 'Remove',
      danger: true
    })
    if (!ok) return
    const result = await deleteBinding({
      connectionId: tab.connectionId,
      source: exchangeName,
      destination: b.destination,
      destinationType: b.destinationType,
      propertiesKey: b.propertiesKey
    })
    if (!result.ok) addToast('error', `Remove failed: ${result.error ?? 'unknown error'}`)
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
        <button
          className="btn btn--sm btn--secondary"
          onClick={() => openPublish(exchangeName, tab.connectionId)}
        >
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
        <div className="section-title-row" style={{ maxWidth: 720 }}>
          <h3 className="section-title" style={{ margin: 0 }}>
            Bindings
          </h3>
          <span className="spacer" />
          <button
            className="btn btn--sm btn--secondary"
            disabled={isDefault}
            title={
              isDefault
                ? 'The default exchange binds every queue implicitly; bindings cannot be added'
                : undefined
            }
            onClick={() => openBinding(exchangeName, tab.connectionId)}
          >
            <span className="codicon codicon-add" />
            Add Binding
          </button>
        </div>
        {bindings.length === 0 ? (
          <p className="placeholder" style={{ padding: 0 }}>
            No bindings.
            {isDefault && ' The default exchange binds every queue implicitly by name.'}
          </p>
        ) : (
          <table className="queue-table" style={{ maxWidth: 720 }}>
            <thead>
              <tr>
                <th>Destination</th>
                <th>Type</th>
                <th>Routing key</th>
                <th style={{ width: 1 }}></th>
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
                  <td>
                    <button
                      className="icon-button"
                      title={
                        b.propertiesKey
                          ? 'Remove binding'
                          : 'This binding cannot be removed (no properties key reported)'
                      }
                      disabled={!b.propertiesKey}
                      onClick={() => void onDeleteBinding(b)}
                    >
                      <span className="codicon codicon-trash" />
                    </button>
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
