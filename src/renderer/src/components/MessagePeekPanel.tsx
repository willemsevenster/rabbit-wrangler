import { useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react'
import { useAppStore, type EditorTab } from '../store/app-store'
import { ContextMenu, useContextMenu, type MenuItem } from './ContextMenu'
import { MessageDetail } from './MessageDetail'
import { byteSize, formatBytes } from '../lib/message-format'
import type { PeekedMessage } from '@shared/types'

type QueueTab = Extract<EditorTab, { kind: 'queue' }>

function menuFor(m: PeekedMessage): MenuItem[] {
  let prettyJson: string | null = null
  try {
    prettyJson = JSON.stringify(JSON.parse(m.payload), null, 2)
  } catch {
    prettyJson = null
  }
  const { copyMessage, exportMessage } = useAppStore.getState()
  return [
    { label: 'Copy Payload', icon: 'copy', onClick: () => window.api.copyText(m.payload) },
    {
      label: 'Copy as Pretty JSON',
      icon: 'json',
      disabled: !prettyJson,
      onClick: () => prettyJson && window.api.copyText(prettyJson)
    },
    {
      label: 'Copy Routing Key',
      icon: 'copy',
      disabled: !m.routingKey,
      onClick: () => window.api.copyText(m.routingKey)
    },
    { separator: true },
    { label: 'Copy Message as JSON', icon: 'json', onClick: () => copyMessage(m, 'json') },
    { label: 'Copy Message as NDJSON', icon: 'json', onClick: () => copyMessage(m, 'ndjson') },
    { label: 'Export Message…', icon: 'save', onClick: () => void exportMessage(m) }
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

  const openMoveDialog = useAppStore((s) => s.openMoveDialog)
  const deleteMessage = useAppStore((s) => s.deleteMessage)
  const maybeConfirm = useAppStore((s) => s.maybeConfirm)
  const addToast = useAppStore((s) => s.addToast)
  const metaWidth = useAppStore((s) => s.detailMetaWidth)
  const setMetaWidth = useAppStore((s) => s.setDetailMetaWidth)

  const setSelectedId = (id: string): void => selectMessage(tab.id, id)
  const selected = peeks.find((m) => m.id === selectedId) ?? null

  function moveMessage(m: PeekedMessage): void {
    openMoveDialog(tab.queue, tab.connectionId, m.fingerprint)
  }

  async function removeMessage(m: PeekedMessage): Promise<void> {
    const ok = await maybeConfirm({
      title: 'Delete message',
      message: `Delete this message from "${tab.queue}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true
    })
    if (!ok) return
    const r = await deleteMessage({
      connectionId: tab.connectionId,
      sourceQueue: tab.queue,
      fingerprint: m.fingerprint
    })
    if (!r.ok) addToast('error', `Delete failed: ${r.error ?? 'unknown error'}`)
  }

  function messageMenu(m: PeekedMessage): MenuItem[] {
    return [
      ...menuFor(m),
      { separator: true },
      { label: 'Move Message…', icon: 'arrow-right', onClick: () => moveMessage(m) },
      { label: 'Delete Message', icon: 'trash', danger: true, onClick: () => void removeMessage(m) }
    ]
  }

  function onTableKeyDown(e: ReactKeyboardEvent<HTMLDivElement>): void {
    if (peeks.length === 0) return
    if (e.key === 'Enter') {
      e.preventDefault()
      // Hop into the message body (Monaco's focusable textarea).
      peekRef.current?.querySelector<HTMLElement>('.monaco-host textarea')?.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const idx = peeks.findIndex((m) => m.id === selectedId)
    let next = idx
    if (e.key === 'ArrowDown') next = idx < 0 ? 0 : Math.min(peeks.length - 1, idx + 1)
    else if (e.key === 'ArrowUp') next = idx < 0 ? 0 : Math.max(0, idx - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = peeks.length - 1
    const m = peeks[next]
    if (!m) return
    setSelectedId(m.id)
    const el = peekRef.current?.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(m.id)}"]`)
    el?.focus()
    el?.scrollIntoView({ block: 'nearest' })
  }

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

      <div className="peek__table-wrap" onKeyDown={onTableKeyDown}>
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
            {peeks.map((m, i) => (
              <tr
                key={m.id}
                className={selectedId === m.id ? 'is-selected' : ''}
                data-msg-id={m.id}
                aria-selected={selectedId === m.id}
                tabIndex={selectedId === m.id || (selectedId == null && i === 0) ? 0 : -1}
                onClick={() => setSelectedId(m.id)}
                onContextMenu={(e) => openMenu(e, messageMenu(m))}
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

      <div
        className="peek__resizer-h"
        onMouseDown={onResizeMouseDown}
        role="separator"
        aria-orientation="horizontal"
      />

      <div className="peek__detail" style={{ height: paneHeight }}>
        {selected ? (
          <MessageDetail
            message={selected}
            onMove={() => moveMessage(selected)}
            onDelete={() => void removeMessage(selected)}
            metaWidth={metaWidth}
            onMetaWidthChange={setMetaWidth}
          />
        ) : (
          <div className="placeholder">Select a message to view its details and payload.</div>
        )}
      </div>

      {menu && <ContextMenu {...menu} onClose={close} />}
    </div>
  )
}
