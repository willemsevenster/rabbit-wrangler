import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useAppStore } from '../store/app-store'
import { MessageDetail } from './MessageDetail'
import { byteSize, formatBytes } from '../lib/message-format'
import type { PeekedMessage } from '@shared/types'

/** Max result rows rendered at once (keeps the popup snappy on busy buffers). */
const RESULT_LIMIT = 500

interface SearchRow {
  key: string
  msg: PeekedMessage
  tabTitle: string
  haystack: string
  haystackLower: string
}

export function SearchDialog() {
  const open = useAppStore((s) => s.searchOpen)
  return open ? <SearchModal /> : null
}

function SearchModal() {
  const close = useAppStore((s) => s.closeSearch)
  const tabs = useAppStore((s) => s.tabs)
  const openMoveDialog = useAppStore((s) => s.openMoveDialog)
  const deleteMessage = useAppStore((s) => s.deleteMessage)
  const maybeConfirm = useAppStore((s) => s.maybeConfirm)
  const addToast = useAppStore((s) => s.addToast)
  // Own persisted detail-pane height + meta-column width (independent of the message tabs).
  const paneHeight = useAppStore((s) => s.searchPaneHeight)
  const setPaneHeight = useAppStore((s) => s.setSearchPaneHeight)
  const metaWidth = useAppStore((s) => s.searchDetailMetaWidth)
  const setMetaWidth = useAppStore((s) => s.setSearchDetailMetaWidth)
  const detailRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [regex, setRegex] = useState(false)
  const [matchCase, setMatchCase] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Esc closes — unless a dialog is stacked on top (its own handler owns Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      const s = useAppStore.getState()
      if (s.confirmRequest || s.moveDialog) return
      close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // Every peeked message across all open queue tabs, newest first. Haystacks are
  // precomputed here (depends only on `tabs`) so filtering per keystroke is cheap.
  const rows = useMemo<SearchRow[]>(() => {
    const all: SearchRow[] = []
    for (const t of tabs) {
      if (t.kind !== 'queue') continue
      for (const m of t.peeks) {
        const haystack = `${m.payload}\n${m.routingKey}\n${m.exchange}\n${JSON.stringify(
          m.headers
        )}\n${JSON.stringify(m.properties)}`
        all.push({
          key: `${m.connectionId}:${m.queue}:${m.id}`,
          msg: m,
          tabTitle: t.title,
          haystack,
          haystackLower: haystack.toLowerCase()
        })
      }
    }
    all.sort((a, b) => b.msg.observedAt - a.msg.observedAt)
    return all
  }, [tabs])

  const { matches, error } = useMemo<{ matches: SearchRow[]; error: string | null }>(() => {
    const q = query.trim()
    if (!q) return { matches: rows, error: null }
    if (regex) {
      let re: RegExp
      try {
        re = new RegExp(query, matchCase ? '' : 'i')
      } catch (e) {
        return { matches: [], error: e instanceof Error ? e.message : 'Invalid regular expression' }
      }
      return { matches: rows.filter((r) => re.test(r.haystack)), error: null }
    }
    // Plain search uses the trimmed term (accidental surrounding whitespace
    // shouldn't matter); regex keeps the raw query since whitespace can be
    // significant in a pattern.
    const needle = matchCase ? q : q.toLowerCase()
    return {
      matches: rows.filter((r) => (matchCase ? r.haystack : r.haystackLower).includes(needle)),
      error: null
    }
  }, [rows, query, regex, matchCase])

  const shown = matches.slice(0, RESULT_LIMIT)
  const selected = matches.find((r) => r.key === selectedKey)?.msg ?? null
  const hasQueueTabs = tabs.some((t) => t.kind === 'queue')

  function doMove(m: PeekedMessage): void {
    openMoveDialog(m.queue, m.connectionId, m.fingerprint)
  }

  function onResizeMouseDown(e: ReactMouseEvent): void {
    e.preventDefault()
    const onMove = (ev: globalThis.MouseEvent): void => {
      const rect = detailRef.current?.getBoundingClientRect()
      if (rect) setPaneHeight(rect.bottom - ev.clientY)
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('resizing-v')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.classList.add('resizing-v')
  }

  async function doDelete(m: PeekedMessage): Promise<void> {
    const ok = await maybeConfirm({
      title: 'Delete message',
      message: `Delete this message from "${m.queue}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true
    })
    if (!ok) return
    const r = await deleteMessage({
      connectionId: m.connectionId,
      sourceQueue: m.queue,
      fingerprint: m.fingerprint
    })
    if (!r.ok) addToast('error', `Delete failed: ${r.error ?? 'unknown error'}`)
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="modal modal--search">
        <div className="modal__header search__header">
          <span>Search messages</span>
          <button className="icon-button" title="Close" onClick={close}>
            <span className="codicon codicon-close" />
          </button>
        </div>

        <div className="search__controls">
          <input
            ref={inputRef}
            type="text"
            className="search__input"
            aria-label="Search messages"
            placeholder={regex ? 'Regular expression…' : 'Search open queue tabs…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            id="search-matchcase"
            type="button"
            className={`search__toggle ${matchCase ? 'is-active' : ''}`}
            title="Match case"
            aria-pressed={matchCase}
            onClick={() => setMatchCase((v) => !v)}
          >
            Aa
          </button>
          <button
            id="search-regex"
            type="button"
            className={`search__toggle ${regex ? 'is-active' : ''}`}
            title="Use regular expression"
            aria-pressed={regex}
            onClick={() => setRegex((v) => !v)}
          >
            .*
          </button>
        </div>

        <div className="search__meta">
          {error ? (
            <span className="search__error">
              <span className="codicon codicon-error" /> {error}
            </span>
          ) : (
            <span>
              {matches.length} match{matches.length === 1 ? '' : 'es'}
              {matches.length > RESULT_LIMIT ? ` (showing first ${RESULT_LIMIT})` : ''} across open
              queue tabs · searches messages already peeked, not the broker
            </span>
          )}
        </div>

        <div className="search__results">
          {!hasQueueTabs ? (
            <div className="placeholder">Open a queue tab to search its peeked messages.</div>
          ) : shown.length === 0 ? (
            <div className="placeholder">{error ? 'Fix the expression to see matches.' : 'No matching messages.'}</div>
          ) : (
            <table className="msg-table">
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>Routing key</th>
                  <th className="num">Size</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr
                    key={r.key}
                    className={selectedKey === r.key ? 'is-selected' : ''}
                    onClick={() => setSelectedKey(r.key)}
                  >
                    <td className="msg-table__muted">{r.tabTitle}</td>
                    <td>
                      <span className="msg-table__rk">{r.msg.routingKey || '(none)'}</span>
                      {r.msg.redelivered && <span className="badge">redelivered</span>}
                      {r.msg.isBinary && <span className="badge">binary</span>}
                    </td>
                    <td className="num">{formatBytes(byteSize(r.msg))}</td>
                    <td className="msg-table__muted">
                      {new Date(r.msg.observedAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div
          className="peek__resizer-h search__resizer"
          onMouseDown={onResizeMouseDown}
          role="separator"
          aria-orientation="horizontal"
        />

        <div className="search__detail" ref={detailRef} style={{ height: paneHeight }}>
          {selected ? (
            <MessageDetail
              message={selected}
              onMove={() => doMove(selected)}
              onDelete={() => void doDelete(selected)}
              metaWidth={metaWidth}
              onMetaWidthChange={setMetaWidth}
            />
          ) : (
            <div className="placeholder">Select a result to view its details and payload.</div>
          )}
        </div>
      </div>
    </div>
  )
}
