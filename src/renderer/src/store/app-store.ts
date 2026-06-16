import { create } from 'zustand'
import { EventSocket } from '../lib/event-socket'
import type { StreamEvent } from '@shared/ipc'
import type {
  BindingInfo,
  ConnectionConfig,
  ConnectionStatus,
  ExchangeInfo,
  MoveMessagesRequest,
  OperationResult,
  PeekedMessage,
  PublishMessageRequest,
  QueueInfo,
  SafeConnectionConfig
} from '@shared/types'

/** Most recent peeked messages retained per queue tab, oldest dropped. */
const PEEK_BUFFER = 500

/**
 * An open tab in the editor area. Tabs are independent: a queue tab keeps its own
 * live-peek buffer and keeps receiving messages even while another tab is active.
 * Identity is `${kind-prefix}:${connectionId}:${name}`, so a queue is keyed by
 * connection too (the same queue name on two clusters gets two tabs).
 */
export type EditorTab =
  | { id: string; kind: 'overview'; connectionId: string; title: string }
  | {
      id: string
      kind: 'queue'
      connectionId: string
      queue: string
      title: string
      /** Live peeked messages for THIS tab, newest first. */
      peeks: PeekedMessage[]
      /** Row selected in this tab's message table (persists across tab switches). */
      selectedMessageId: string | null
      /** New messages received while this tab was in the background. */
      unread: number
    }
  | {
      id: string
      kind: 'exchange'
      connectionId: string
      exchange: string
      title: string
      bindings: BindingInfo[]
    }

export const overviewTabId = (c: string): string => `o:${c}`
export const queueTabId = (c: string, q: string): string => `q:${c}:${q}`
export const exchangeTabId = (c: string, x: string): string => `x:${c}:${x}`

interface AppState {
  connections: SafeConnectionConfig[]
  statuses: Record<string, ConnectionStatus>
  /** The connection whose queues/exchanges populate the tree (one at a time). */
  selectedConnectionId: string | null
  /** Whether the active connection's children are collapsed in the tree. */
  connectionCollapsed: boolean
  /** Per-connection queue + exchange lists. The tree shows the selected
   * connection's; overview tabs read their own connection's. */
  queuesByConn: Record<string, QueueInfo[]>
  exchangesByConn: Record<string, ExchangeInfo[]>
  /** Tree group collapse state (under the active connection). */
  queuesCollapsed: boolean
  exchangesCollapsed: boolean

  /** Open editor tabs and the active one. */
  tabs: EditorTab[]
  activeTabId: string | null

  /** Connection editor modal. `editing` null + open ⇒ creating a new one. */
  dialogOpen: boolean
  editing: SafeConnectionConfig | null

  /** Target of the open Move-messages dialog (null = closed). Carries the
   * connection so a move launched from a background-connection tab is correct. */
  moveDialog: { connectionId: string; queue: string } | null
  /** Target of the open Publish-message dialog (null = closed). */
  publishDialog: { connectionId: string; exchange: string } | null

  /** Sidebar layout: persisted width and collapse state. */
  sidebarWidth: number
  sidebarVisible: boolean
  /** Persisted height of the message-detail pane in the peek view. */
  peekPaneHeight: number

  init(): Promise<void>
  refreshConnections(): Promise<void>
  selectConnection(id: string): Promise<void>
  connectConnection(id: string): Promise<void>
  disconnectConnection(id: string): Promise<void>
  toggleConnectionCollapsed(): void

  // editor tabs
  openOverviewTab(connectionId: string): void
  openQueueTab(connectionId: string, queue: string): void
  openExchangeTab(connectionId: string, exchange: string): Promise<void>
  setActiveTab(id: string): void
  closeTab(id: string): void
  refreshTab(id: string): Promise<void>
  selectTabMessage(tabId: string, messageId: string | null): void

  refreshQueues(connectionId?: string): Promise<void>
  purgeQueue(queue: string, connectionId?: string): Promise<OperationResult>
  openMoveDialog(queue: string, connectionId?: string): void
  closeMoveDialog(): void
  moveMessages(req: MoveMessagesRequest): Promise<OperationResult>

  refreshExchanges(connectionId?: string): Promise<void>
  deleteExchange(name: string, connectionId?: string): Promise<OperationResult>
  toggleQueuesCollapsed(): void
  toggleExchangesCollapsed(): void
  openPublishDialog(exchange: string, connectionId?: string): void
  closePublishDialog(): void
  publishMessage(req: PublishMessageRequest): Promise<OperationResult>

  setSidebarWidth(width: number): void
  toggleSidebar(): void
  setPeekPaneHeight(height: number): void

  openNewConnection(): void
  editConnection(connection: SafeConnectionConfig): void
  closeDialog(): void
  saveConnection(config: ConnectionConfig): Promise<void>
  deleteConnection(id: string): Promise<void>
}

let socket: EventSocket | null = null
let initialized = false
/** `${connId}:${queue}` → epoch ms of a recent purge, so the ~5s-lagged stats
 * poll doesn't briefly re-show the old count. */
const purgedAt = new Map<string, number>()
const PURGE_GRACE_MS = 6000

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 600
const clampWidth = (w: number): number =>
  Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)))
const initialSidebarWidth = clampWidth(Number(localStorage.getItem('rw.sidebarWidth')) || 300)

const PEEK_PANE_MIN = 120
const PEEK_PANE_MAX = 700
const clampPaneHeight = (h: number): number =>
  Math.min(PEEK_PANE_MAX, Math.max(PEEK_PANE_MIN, Math.round(h)))
const initialPeekPaneHeight = clampPaneHeight(Number(localStorage.getItem('rw.peekPaneHeight')) || 260)

export const useAppStore = create<AppState>((set, get) => ({
  connections: [],
  statuses: {},
  selectedConnectionId: null,
  connectionCollapsed: false,
  queuesByConn: {},
  exchangesByConn: {},
  queuesCollapsed: false,
  exchangesCollapsed: false,
  tabs: [],
  activeTabId: null,
  dialogOpen: false,
  editing: null,
  moveDialog: null,
  publishDialog: null,
  sidebarWidth: initialSidebarWidth,
  sidebarVisible: true,
  peekPaneHeight: initialPeekPaneHeight,

  async init() {
    if (initialized) return
    initialized = true
    socket = new EventSocket((event) => applyStreamEvent(set, get, event))
    await socket.connect()
    await get().refreshConnections()
    // Keep queue counts fresh: RabbitMQ stats sample ~5s, and peeking shifts
    // messages between ready/unacked, so a one-time snapshot goes stale fast.
    setInterval(() => {
      if (get().selectedConnectionId) void get().refreshQueues()
    }, 4000)
  },

  async refreshConnections() {
    set({ connections: await window.api.listConnections() })
  },

  async selectConnection(id) {
    // Clicking a connection makes it the tree's active connection, ensures it's
    // connected, and opens/activates its overview tab. It never disconnects.
    if (get().statuses[id]?.state === 'connected') {
      set({ selectedConnectionId: id, connectionCollapsed: false })
    } else {
      await get().connectConnection(id)
    }
    if (get().statuses[id]?.state === 'connected') get().openOverviewTab(id)
  },

  toggleConnectionCollapsed() {
    set({ connectionCollapsed: !get().connectionCollapsed })
  },

  async connectConnection(id) {
    set({
      selectedConnectionId: id,
      connectionCollapsed: false,
      statuses: { ...get().statuses, [id]: { connectionId: id, state: 'connecting' } }
    })
    try {
      await window.api.connect(id)
      // Derive status from the call result — the WS status events emitted during
      // connect() can race the renderer's socket setup and be missed.
      set({ statuses: { ...get().statuses, [id]: { connectionId: id, state: 'connected' } } })
      await Promise.all([get().refreshQueues(id), get().refreshExchanges(id)])
    } catch (e) {
      set({
        statuses: {
          ...get().statuses,
          [id]: {
            connectionId: id,
            state: 'error',
            error: e instanceof Error ? e.message : String(e)
          }
        }
      })
    }
  },

  async disconnectConnection(id) {
    await window.api.disconnect(id)
    set({ statuses: { ...get().statuses, [id]: { connectionId: id, state: 'disconnected' } } })
    closeTabsFor(set, get, id)
    if (get().selectedConnectionId === id) set({ selectedConnectionId: null })
  },

  openOverviewTab(connectionId) {
    const id = overviewTabId(connectionId)
    if (!get().tabs.some((t) => t.id === id)) {
      const title = get().connections.find((c) => c.id === connectionId)?.name ?? connectionId
      set({ tabs: [...get().tabs, { id, kind: 'overview', connectionId, title }] })
    }
    set({ activeTabId: id })
  },

  openQueueTab(connectionId, queue) {
    const id = queueTabId(connectionId, queue)
    if (get().tabs.some((t) => t.id === id)) {
      // Focus the existing tab — never duplicate, never clear its context.
      set({
        activeTabId: id,
        tabs: get().tabs.map((t) => (t.id === id && t.kind === 'queue' ? { ...t, unread: 0 } : t))
      })
      return
    }
    const tab: EditorTab = {
      id,
      kind: 'queue',
      connectionId,
      queue,
      title: queue,
      peeks: [],
      selectedMessageId: null,
      unread: 0
    }
    set({ tabs: [...get().tabs, tab], activeTabId: id })
    void window.api.startPeek(connectionId, queue)
  },

  async openExchangeTab(connectionId, exchange) {
    const id = exchangeTabId(connectionId, exchange)
    if (get().tabs.some((t) => t.id === id)) {
      set({ activeTabId: id })
      return
    }
    const title = exchange === '' ? '(AMQP default)' : exchange
    set({
      tabs: [...get().tabs, { id, kind: 'exchange', connectionId, exchange, title, bindings: [] }],
      activeTabId: id
    })
    try {
      const bindings = await window.api.listExchangeBindings(connectionId, exchange)
      set({
        tabs: get().tabs.map((t) =>
          t.id === id && t.kind === 'exchange' ? { ...t, bindings } : t
        )
      })
    } catch {
      // leave bindings empty
    }
  },

  setActiveTab(id) {
    set({
      activeTabId: id,
      tabs: get().tabs.map((t) => (t.id === id && t.kind === 'queue' ? { ...t, unread: 0 } : t))
    })
  },

  closeTab(id) {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    const tab = tabs[idx]
    if (tab.kind === 'queue') void window.api.stopPeek(tab.connectionId, tab.queue)
    const remaining = tabs.filter((t) => t.id !== id)
    let nextActive = activeTabId
    if (activeTabId === id) {
      const neighbor = remaining[idx] ?? remaining[idx - 1] ?? null
      nextActive = neighbor ? neighbor.id : null
    }
    set({ tabs: remaining, activeTabId: nextActive })
  },

  async refreshTab(id) {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab) return
    if (tab.kind === 'queue') {
      // Clear this tab's context and re-peek from scratch: stopping the peeker
      // resets the broker-side de-dup set so the current head window re-surfaces.
      set({
        tabs: get().tabs.map((t) =>
          t.id === id && t.kind === 'queue'
            ? { ...t, peeks: [], unread: 0, selectedMessageId: null }
            : t
        )
      })
      await window.api.stopPeek(tab.connectionId, tab.queue)
      await window.api.startPeek(tab.connectionId, tab.queue)
    } else if (tab.kind === 'exchange') {
      await get().refreshExchanges(tab.connectionId)
      try {
        const bindings = await window.api.listExchangeBindings(tab.connectionId, tab.exchange)
        set({
          tabs: get().tabs.map((t) =>
            t.id === id && t.kind === 'exchange' ? { ...t, bindings } : t
          )
        })
      } catch {
        // leave bindings as-is
      }
    } else {
      await get().refreshQueues(tab.connectionId)
    }
  },

  selectTabMessage(tabId, messageId) {
    set({
      tabs: get().tabs.map((t) =>
        t.id === tabId && t.kind === 'queue' ? { ...t, selectedMessageId: messageId } : t
      )
    })
  },

  async refreshQueues(connectionId) {
    const cid = connectionId ?? get().selectedConnectionId
    if (!cid) return
    try {
      const fresh = await window.api.listQueues(cid)
      const now = Date.now()
      const adjusted = fresh.map((q) => {
        const key = `${cid}:${q.name}`
        const t = purgedAt.get(key)
        if (t && now - t < PURGE_GRACE_MS) {
          return { ...q, messages: 0, messagesReady: 0, messagesUnacknowledged: 0 }
        }
        if (t) purgedAt.delete(key)
        return q
      })
      set({ queuesByConn: { ...get().queuesByConn, [cid]: adjusted } })
    } catch {
      set({ queuesByConn: { ...get().queuesByConn, [cid]: [] } })
    }
  },

  async purgeQueue(queue, connectionId) {
    const cid = connectionId ?? get().selectedConnectionId
    if (!cid) return { ok: false, affected: 0, error: 'No connection selected' }
    // main stops the peeker before purging (so held messages are purgeable).
    const result = await window.api.purgeQueue(cid, queue)
    if (result.ok) {
      // The management API's queue stats sample only every ~5s, so a refresh here
      // would still report the pre-purge count. Optimistically zero the purged
      // queue instead, and suppress the stat poll for it until the broker catches up.
      purgedAt.set(`${cid}:${queue}`, Date.now())
      const list = get().queuesByConn[cid] ?? []
      set({
        queuesByConn: {
          ...get().queuesByConn,
          [cid]: list.map((q) =>
            q.name === queue
              ? { ...q, messages: 0, messagesReady: 0, messagesUnacknowledged: 0 }
              : q
          )
        },
        tabs: clearQueueTab(get().tabs, queueTabId(cid, queue))
      })
    }
    // Resume the live peek of the now-empty queue if its tab is open.
    if (get().tabs.some((t) => t.id === queueTabId(cid, queue))) {
      void window.api.startPeek(cid, queue)
    }
    return result
  },

  openMoveDialog(queue, connectionId) {
    const cid = connectionId ?? get().selectedConnectionId
    if (!cid) return
    set({ moveDialog: { connectionId: cid, queue } })
  },

  closeMoveDialog() {
    set({ moveDialog: null })
  },

  async moveMessages(req) {
    // main releases the source peeker before draining (see ClusterConnection).
    const result = await window.api.moveMessages(req)
    if (result.ok) {
      set({ moveDialog: null })
      // The source was drained; clear its tab and resume its peek if open.
      const tid = queueTabId(req.connectionId, req.sourceQueue)
      if (get().tabs.some((t) => t.id === tid)) {
        set({ tabs: clearQueueTab(get().tabs, tid) })
        void window.api.startPeek(req.connectionId, req.sourceQueue)
      }
      await get().refreshQueues(req.connectionId)
    }
    return result
  },

  async refreshExchanges(connectionId) {
    const cid = connectionId ?? get().selectedConnectionId
    if (!cid) return
    try {
      set({ exchangesByConn: { ...get().exchangesByConn, [cid]: await window.api.listExchanges(cid) } })
    } catch {
      set({ exchangesByConn: { ...get().exchangesByConn, [cid]: [] } })
    }
  },

  async deleteExchange(name, connectionId) {
    const cid = connectionId ?? get().selectedConnectionId
    if (!cid) return { ok: false, affected: 0, error: 'No connection selected' }
    const result = await window.api.deleteExchange(cid, name)
    if (result.ok) {
      get().closeTab(exchangeTabId(cid, name))
      await get().refreshExchanges(cid)
    }
    return result
  },

  toggleQueuesCollapsed() {
    set({ queuesCollapsed: !get().queuesCollapsed })
  },

  toggleExchangesCollapsed() {
    set({ exchangesCollapsed: !get().exchangesCollapsed })
  },

  openPublishDialog(exchange, connectionId) {
    const cid = connectionId ?? get().selectedConnectionId
    if (!cid) return
    set({ publishDialog: { connectionId: cid, exchange } })
  },

  closePublishDialog() {
    set({ publishDialog: null })
  },

  async publishMessage(req) {
    const result = await window.api.publishMessage(req)
    if (result.ok) {
      set({ publishDialog: null })
      // A routed message lands in a queue — refresh counts.
      await get().refreshQueues(req.connectionId)
    }
    return result
  },

  setSidebarWidth(width) {
    const w = clampWidth(width)
    localStorage.setItem('rw.sidebarWidth', String(w))
    set({ sidebarWidth: w })
  },

  toggleSidebar() {
    set({ sidebarVisible: !get().sidebarVisible })
  },

  setPeekPaneHeight(height) {
    const h = clampPaneHeight(height)
    localStorage.setItem('rw.peekPaneHeight', String(h))
    set({ peekPaneHeight: h })
  },

  openNewConnection() {
    set({ dialogOpen: true, editing: null })
  },

  editConnection(connection) {
    set({ dialogOpen: true, editing: connection })
  },

  closeDialog() {
    set({ dialogOpen: false, editing: null })
  },

  async saveConnection(config) {
    await window.api.saveConnection(config)
    set({ dialogOpen: false, editing: null })
    await get().refreshConnections()
  },

  async deleteConnection(id) {
    await window.api.deleteConnection(id)
    closeTabsFor(set, get, id)
    if (get().selectedConnectionId === id) set({ selectedConnectionId: null })
    await get().refreshConnections()
  }
}))

/** Reset a queue tab's accumulated context (peeks/unread/selection). */
function clearQueueTab(tabs: EditorTab[], tabId: string): EditorTab[] {
  return tabs.map((t) =>
    t.id === tabId && t.kind === 'queue'
      ? { ...t, peeks: [], unread: 0, selectedMessageId: null }
      : t
  )
}

/** Close every tab belonging to a connection (on disconnect/delete) and stop
 * any of their peekers, fixing up the active tab. */
function closeTabsFor(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  connectionId: string
): void {
  const { tabs, activeTabId } = get()
  for (const t of tabs) {
    if (t.connectionId === connectionId && t.kind === 'queue') {
      void window.api.stopPeek(t.connectionId, t.queue)
    }
  }
  const remaining = tabs.filter((t) => t.connectionId !== connectionId)
  const activeAlive = remaining.some((t) => t.id === activeTabId)
  set({
    tabs: remaining,
    activeTabId: activeAlive ? activeTabId : (remaining[remaining.length - 1]?.id ?? null)
  })
}

/** Reducer for events arriving over the WebSocket. */
function applyStreamEvent(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  event: StreamEvent
): void {
  switch (event.type) {
    case 'connection-status':
      set({ statuses: { ...get().statuses, [event.payload.connectionId]: event.payload } })
      break
    case 'peek': {
      const { tabs, activeTabId } = get()
      const tid = queueTabId(event.payload.connectionId, event.payload.queue)
      if (!tabs.some((t) => t.id === tid)) break
      set({
        tabs: tabs.map((t) => {
          if (t.id !== tid || t.kind !== 'queue') return t
          return {
            ...t,
            peeks: [event.payload, ...t.peeks].slice(0, PEEK_BUFFER),
            unread: t.id === activeTabId ? t.unread : t.unread + 1
          }
        })
      })
      break
    }
    case 'queue-stats':
      set({
        queuesByConn: { ...get().queuesByConn, [event.payload.connectionId]: event.payload.queues }
      })
      break
  }
}
