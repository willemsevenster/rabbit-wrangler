import { useRef, type MouseEvent } from 'react'
import { useAppStore, type EditorTab } from '../store/app-store'
import { ContextMenu, useContextMenu, type MenuItem } from './ContextMenu'
import { MonacoViewer } from './MonacoViewer'
import type { PeekedMessage } from '@shared/types'

type QueueTab = Extract<EditorTab, { kind: 'queue' }>

/** amqplib exposes properties camelCased; show the familiar RabbitMQ names, in order. */
const PROP_ORDER: [string, string][] = [
  ['contentType', 'content_type'],
  ['contentEncoding', 'content_encoding'],
  ['deliveryMode', 'delivery_mode'],
  ['priority', 'priority'],
  ['correlationId', 'correlation_id'],
  ['replyTo', 'reply_to'],
  ['expiration', 'expiration'],
  ['messageId', 'message_id'],
  ['timestamp', 'timestamp'],
  ['type', 'type'],
  ['userId', 'user_id'],
  ['appId', 'app_id'],
  ['clusterId', 'cluster_id']
]

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function byteSize(m: PeekedMessage): number {
  if (m.isBinary) {
    try {
      return atob(m.payload).length
    } catch {
      return m.payload.length
    }
  }
  return new TextEncoder().encode(m.payload).length
}

function displayValue(key: string, value: unknown): string {
  if (key === 'deliveryMode') return value === 2 ? '2 (persistent)' : `${value} (transient)`
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function propertyRows(props: Record<string, unknown>): [string, string][] {
  const rows: [string, string][] = []
  const seen = new Set<string>()
  for (const [key, label] of PROP_ORDER) {
    const v = props[key]
    if (v != null && v !== '') {
      rows.push([label, displayValue(key, v)])
      seen.add(key)
    }
  }
  for (const [key, v] of Object.entries(props)) {
    if (!seen.has(key) && v != null && v !== '') rows.push([key, displayValue(key, v)])
  }
  return rows
}

function deathRecords(headers: Record<string, unknown>): Record<string, unknown>[] {
  const xd = headers['x-death']
  return Array.isArray(xd) ? (xd as Record<string, unknown>[]) : []
}

function detectLanguage(m: PeekedMessage): string {
  const ct = String(m.properties.contentType ?? '').toLowerCase()
  if (ct.includes('json')) return 'json'
  if (!m.isBinary) {
    const t = m.payload.trimStart()
    if (t.startsWith('{') || t.startsWith('[')) return 'json'
  }
  return 'plaintext'
}

function menuFor(m: PeekedMessage): MenuItem[] {
  let prettyJson: string | null = null
  try {
    prettyJson = JSON.stringify(JSON.parse(m.payload), null, 2)
  } catch {
    prettyJson = null
  }
  return [
    { label: 'Copy Payload', icon: 'copy', onClick: () => window.api.copyText(m.payload) },
    {
      label: 'Copy as Pretty JSON',
      icon: 'json',
      disabled: !prettyJson,
      onClick: () => prettyJson && window.api.copyText(prettyJson)
    },
    { separator: true },
    {
      label: 'Copy Routing Key',
      icon: 'copy',
      disabled: !m.routingKey,
      onClick: () => window.api.copyText(m.routingKey)
    }
  ]
}

/**
 * Live tail of messages flowing through one queue tab, shown as a table.
 * Selecting a row opens its details + payload (read-only Monaco) in a resizable
 * pane below. Buffer + selection live on the tab (in the store), so the view
 * keeps its context when you switch tabs and away while it peeks in the background.
 */
export function MessagePeekPanel({ tab }: { tab: QueueTab }) {
  const peeks = tab.peeks
  const selectedId = tab.selectedMessageId
  const paneHeight = useAppStore((s) => s.peekPaneHeight)
  const setPaneHeight = useAppStore((s) => s.setPeekPaneHeight)
  const selectMessage = useAppStore((s) => s.selectTabMessage)
  const { menu, openMenu, close } = useContextMenu()
  const peekRef = useRef<HTMLDivElement>(null)

  const setSelectedId = (id: string): void => selectMessage(tab.id, id)
  const selected = peeks.find((m) => m.id === selectedId) ?? null

  function onResizeMouseDown(e: MouseEvent) {
    e.preventDefault()
    const onMove = (ev: globalThis.MouseEvent) => {
      const rect = peekRef.current?.getBoundingClientRect()
      if (rect) setPaneHeight(rect.bottom - ev.clientY)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('resizing-v')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.classList.add('resizing-v')
  }

  return (
    <div className="peek" ref={peekRef}>
      <div className="peek__toolbar">
        <span className="codicon codicon-eye" />
        {peeks.length} unique message{peeks.length === 1 ? '' : 's'} · live · de-duplicated ·
        non-destructive
      </div>

      <div className="peek__table-wrap">
        <table className="msg-table">
          <thead>
            <tr>
              <th>Routing key</th>
              <th>Exchange</th>
              <th className="num">Size</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {peeks.map((m) => (
              <tr
                key={m.id}
                className={selectedId === m.id ? 'is-selected' : ''}
                onClick={() => setSelectedId(m.id)}
                onContextMenu={(e) => openMenu(e, menuFor(m))}
              >
                <td>
                  <span className="msg-table__rk">{m.routingKey || '(none)'}</span>
                  {m.redelivered && <span className="badge">redelivered</span>}
                  {m.isBinary && <span className="badge">binary</span>}
                </td>
                <td className="msg-table__muted">{m.exchange || '(default)'}</td>
                <td className="num">{formatBytes(byteSize(m))}</td>
                <td className="msg-table__muted">{new Date(m.observedAt).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {peeks.length === 0 && <div className="placeholder">Waiting for messages…</div>}
      </div>

      <div className="peek__resizer-h" onMouseDown={onResizeMouseDown} role="separator" />

      <div className="peek__detail" style={{ height: paneHeight }}>
        {selected ? (
          <MessageDetailPane message={selected} />
        ) : (
          <div className="placeholder">Select a message to view its details and payload.</div>
        )}
      </div>

      {menu && <ContextMenu {...menu} onClose={close} />}
    </div>
  )
}

function MessageDetailPane({ message: m }: { message: PeekedMessage }) {
  const props = propertyRows(m.properties)
  const deaths = deathRecords(m.headers)
  const otherHeaders = Object.entries(m.headers).filter(([k]) => k !== 'x-death')
  const metaWidth = useAppStore((s) => s.detailMetaWidth)
  const setMetaWidth = useAppStore((s) => s.setDetailMetaWidth)
  const detailRef = useRef<HTMLDivElement>(null)

  function onMetaResize(e: MouseEvent) {
    e.preventDefault()
    const onMove = (ev: globalThis.MouseEvent) => {
      const rect = detailRef.current?.getBoundingClientRect()
      if (rect) setMetaWidth(ev.clientX - rect.left)
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
        <div className="peek-item__summary">
          <span>
            Exchange: <code>{m.exchange || '(default)'}</code>
          </span>
          <span>Routing key: <code>{m.routingKey || '(none)'}</code></span>
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

      <div className="msg-detail__resizer" onMouseDown={onMetaResize} role="separator" />

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
