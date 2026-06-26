import { useRef, type MouseEvent } from 'react'
import { MonacoViewer } from './MonacoViewer'
import { useAppStore } from '../store/app-store'
import { byteSize, deathRecords, detectLanguage, formatBytes, propertyRows } from '../lib/message-format'
import type { PeekedMessage } from '@shared/types'

/**
 * The message detail/payload pane: properties, x-death history, headers and the
 * read-only Monaco payload, with Move/Delete actions. Shared by the queue peek
 * view ({@link MessagePeekPanel}) and the cross-tab search popup. The resizable
 * meta-column width is supplied by the caller (`metaWidth`/`onMetaWidthChange`),
 * so each context persists its own.
 */
export function MessageDetail({
  message: m,
  onMove,
  onDelete,
  metaWidth,
  onMetaWidthChange
}: {
  message: PeekedMessage
  onMove: () => void
  onDelete: () => void
  metaWidth: number
  onMetaWidthChange: (width: number) => void
}) {
  const props = propertyRows(m.properties)
  const deaths = deathRecords(m.headers)
  const otherHeaders = Object.entries(m.headers).filter(([k]) => k !== 'x-death')
  const detailRef = useRef<HTMLDivElement>(null)
  const copyMessage = useAppStore((s) => s.copyMessage)
  const exportMessage = useAppStore((s) => s.exportMessage)

  function onMetaResize(e: MouseEvent) {
    e.preventDefault()
    const onMove = (ev: globalThis.MouseEvent) => {
      const rect = detailRef.current?.getBoundingClientRect()
      if (rect) onMetaWidthChange(ev.clientX - rect.left)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('resizing')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.classList.add('resizing')
  }

  return (
    <div className="msg-detail" ref={detailRef}>
      <div className="msg-detail__meta" style={{ width: metaWidth }}>
        <div className="msg-detail__actions">
          <button className="btn btn--sm btn--secondary" onClick={onMove}>
            <span className="codicon codicon-arrow-right" />
            Move
          </button>
          <button
            className="btn btn--sm btn--secondary"
            title="Copy this message as JSON to the clipboard"
            onClick={() => copyMessage(m, 'json')}
          >
            <span className="codicon codicon-copy" />
            Copy
          </button>
          <button
            className="btn btn--sm btn--secondary"
            title="Export this message to a file"
            onClick={() => void exportMessage(m)}
          >
            <span className="codicon codicon-save" />
            Export
          </button>
          <button className="btn btn--sm btn--danger" onClick={onDelete}>
            <span className="codicon codicon-trash" />
            Delete
          </button>
        </div>
        <div className="peek-item__summary">
          <span>
            Exchange: <code>{m.exchange || '(default)'}</code>
          </span>
          <span>
            Routing key: <code>{m.routingKey || '(none)'}</code>
          </span>
          <span>Size: {formatBytes(byteSize(m))}</span>
        </div>

        {props.length > 0 && (
          <>
            <div className="peek-item__section">Properties</div>
            <table className="kv-table">
              <tbody>
                {props.map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {deaths.length > 0 && (
          <>
            <div className="peek-item__section">Dead-letter history (x-death)</div>
            <table className="kv-table">
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>Reason</th>
                  <th>Count</th>
                  <th>Routing key(s)</th>
                </tr>
              </thead>
              <tbody>
                {deaths.map((d, i) => (
                  <tr key={i}>
                    <td>{String(d.queue ?? '')}</td>
                    <td>{String(d.reason ?? '')}</td>
                    <td>{String(d.count ?? '')}</td>
                    <td>
                      {Array.isArray(d['routing-keys'])
                        ? (d['routing-keys'] as unknown[]).join(', ')
                        : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {otherHeaders.length > 0 && (
          <>
            <div className="peek-item__section">Headers</div>
            <table className="kv-table">
              <tbody>
                {otherHeaders.map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div
        className="msg-detail__resizer"
        onMouseDown={onMetaResize}
        role="separator"
        aria-orientation="vertical"
      />

      <div className="msg-detail__payload">
        <div className="peek-item__section" style={{ margin: '0 0 6px' }}>
          Payload {m.isBinary && '(base64)'}
        </div>
        <div className="msg-detail__editor">
          <MonacoViewer value={m.payload} language={detectLanguage(m)} />
        </div>
      </div>
    </div>
  )
}
