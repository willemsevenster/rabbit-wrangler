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

/** Most recent peeked messages to retain per queue, oldest dropped. */
const PEEK_BUFFER = 500

interface AppState {
  connections: SafeConnectionConfig[]
  statuses: Record<string, ConnectionStatus>
  /** The connection whose queues are loaded/active (one at a time). */
  selectedConnectionId: string | null
  /** Whether the active connection's queue list is collapsed in the tree. */
  connectionCollapsed: boolean
  queues: QueueInfo[]
  selectedQueue: string | null
  exchanges: ExchangeInfo[]
  selectedExchange: string | null
  /** Bindings for the selected exchange (read-only). */
  bindings: BindingInfo[]
  /** Tree group collapse state (under the active connection). */
  queuesCollapsed: boolean
  exchangesCollapsed: boolean
  /** Live peeked messages, newest first. */
  peeks: PeekedMessage[]

  /** Connection editor modal. `editing` null + open ⇒ creating a new one. */
  dialogOpen: boolean
  editing: SafeConnectionConfig | null

  /** Source queue for the open Move-messages dialog (null = closed). */
  moveDialogQueue: string | null
  /** Exchange for the open Publish-message dialog (null = closed). */
  publishDialogExchange: string | null

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
  selectQueue(queue: string | null): void
  refreshQueues(): Promise<void>
  purgeQueue(queue: string): Promise<OperationResult>
  openMoveDialog(queue: string): void
  closeMoveDialog(): void
  moveMessages(req: MoveMessagesRequest): Promise<OperationResult>

  refreshExchanges(): Promise<void>
  selectExchange(name: string): Promise<void>
  deleteExchange(name: string): Promise<OperationResult>
  toggleQueuesCollapsed(): void
  toggleExchangesCollapsed(): void
  openPublishDialog(exchange: string): void
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
  queues: [],
  selectedQueue: null,
  exchanges: [],
  selectedExchange: null,
  bindings: [],
  queuesCollapsed: false,
  exchangesCollapsed: false,
  peeks: [],
  dialogOpen: false,
  editing: null,
  moveDialogQueue: null,
  publishDialogExchange: null,
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
    // Clicking the active connection just shows its overview (deselect any queue)
    // and ensures it's expanded — it never disconnects or collapses.
    if (get().selectedConnectionId === id) {
      set({ selectedQueue: null, selectedExchange: null, connectionCollapsed: false })
      return
    }
    await get().connectConnection(id)
  },

  toggleConnectionCollapsed() {
    set({ connectionCollapsed: !get().connectionCollapsed })
  },

  async connectConnection(id) {
    set({
      selectedConnectionId: id,
      selectedQueue: null,
      queues: [],
      exchanges: [],
      selectedExchange: null,
      bindings: [],
      peeks: [],
      connectionCollapsed: false,
      statuses: { ...get().statuses, [id]: { connectionId: id, state: 'connecting' } }
    })
    try {
      await window.api.connect(id)
      // Derive status from the call result — the WS status events emitted during
      // connect() can race the renderer's socket setup and be missed.
      set({ statuses: { ...get().statuses, [id]: { connectionId: id, state: 'connected' } } })
      await Promise.all([get().refreshQueues(), get().refreshExchanges()])
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
    if (get().selectedConnectionId === id) {
      set({
        selectedConnectionId: null,
        selectedQueue: null,
        queues: [],
        exchanges: [],
        selectedExchange: null,
        bindings: [],
        peeks: []
      })
    }
  },

  selectQueue(queue) {
    const { selectedConnectionId, selectedQueue } = get()
    if (!selectedConnectionId) return
    // Re-clicking the queue you're already viewing must NOT clear the list: the
    // de-duplicated peeker won't re-emit messages it has already surfaced, so a
    // clear-and-restart here would leave the pane empty.
    if (queue === selectedQueue) return
    if (selectedQueue) void window.api.stopPeek(selectedConnectionId, selectedQueue)
    set({ selectedQueue: queue, selectedExchange: null, peeks: [] })
    if (queue) void window.api.startPeek(selectedConnectionId, queue)
  },

  async refreshQueues() {
    const { selectedConnectionId } = get()
    if (!selectedConnectionId) return
    try {
      const fresh = await window.api.listQueues(selectedConnectionId)
      const now = Date.now()
      set({
        queues: fresh.map((q) => {
          const key = `${selectedConnectionId}:${q.name}`
          const t = purgedAt.get(key)
          if (t && now - t < PURGE_GRACE_MS) {
            return { ...q, messages: 0, messagesReady: 0, messagesUnacknowledged: 0 }
          }
          if (t) purgedAt.delete(key)
          return q
        })
      })
    } catch {
      set({ queues: [] })
    }
  },

  async purgeQueue(queue) {
    const { selectedConnectionId } = get()
    if (!selectedConnectionId) return { ok: false, affected: 0, error: 'No connection selected' }
    // main stops the peeker before purging (so held messages are purgeable).
    const result = await window.api.purgeQueue(selectedConnectionId, queue)
    if (result.ok) {
      // The management API's queue stats sample only every ~5s, so a refresh here
      // would still report the pre-purge count. Optimistically zero the purged
      // queue instead, and suppress the stat poll for it until the broker catches up.
      purgedAt.set(`${selectedConnectionId}:${queue}`, Date.now())
      set({
        peeks: [],
        queues: get().queues.map((q) =>
          q.name === queue
            ? { ...q, messages: 0, messagesReady: 0, messagesUnacknowledged: 0 }
            : q
        )
      })
    }
    // Resume the live peek of the now-empty queue.
    if (get().selectedQueue === queue) void window.api.startPeek(selectedConnectionId, queue)
    return result
  },

  openMoveDialog(queue) {
    set({ moveDialogQueue: queue })
  },

  closeMoveDialog() {
    set({ moveDialogQueue: null })
  },

  async moveMessages(req) {
    // main releases the source peeker before draining (see ClusterConnection).
    const result = await window.api.moveMessages(req)
    if (result.ok) {
      set({ moveDialogQueue: null })
      // The source was drained; refresh counts and resume its peek if open.
      if (get().selectedQueue === req.sourceQueue) {
        set({ peeks: [] })
        void window.api.startPeek(req.connectionId, req.sourceQueue)
      }
      await get().refreshQueues()
    }
    return result
  },

  async refreshExchanges() {
    const { selectedConnectionId } = get()
    if (!selectedConnectionId) return
    try {
      set({ exchanges: await window.api.listExchanges(selectedConnectionId) })
    } catch {
      set({ exchanges: [] })
    }
  },

  async selectExchange(name) {
    const { selectedConnectionId, selectedQueue } = get()
    if (!selectedConnectionId) return
    if (selectedQueue) void window.api.stopPeek(selectedConnectionId, selectedQueue)
    set({ selectedExchange: name, selectedQueue: null, peeks: [], bindings: [] })
    try {
      set({ bindings: await window.api.listExchangeBindings(selectedConnectionId, name) })
    } catch {
      set({ bindings: [] })
    }
  },

  async deleteExchange(name) {
    const { selectedConnectionId } = get()
    if (!selectedConnectionId) return { ok: false, affected: 0, error: 'No connection selected' }
    const result = await window.api.deleteExchange(selectedConnectionId, name)
    if (result.ok) {
      if (get().selectedExchange === name) set({ selectedExchange: null, bindings: [] })
      await get().refreshExchanges()
    }
    return result
  },

  toggleQueuesCollapsed() {
    set({ queuesCollapsed: !get().queuesCollapsed })
  },

  toggleExchangesCollapsed() {
    set({ exchangesCollapsed: !get().exchangesCollapsed })
  },

  openPublishDialog(exchange) {
    set({ publishDialogExchange: exchange })
  },

  closePublishDialog() {
    set({ publishDialogExchange: null })
  },

  async publishMessage(req) {
    const result = await window.api.publishMessage(req)
    if (result.ok) {
      set({ publishDialogExchange: null })
      // A routed message lands in a queue — refresh counts.
      await get().refreshQueues()
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
    if (get().selectedConnectionId === id) {
      set({ selectedConnectionId: null, queues: [], selectedQueue: null, peeks: [] })
    }
    await get().refreshConnections()
  }
}))

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
      const { selectedQueue, selectedConnectionId, peeks } = get()
      if (
        event.payload.queue === selectedQueue &&
        event.payload.connectionId === selectedConnectionId
      ) {
        set({ peeks: [event.payload, ...peeks].slice(0, PEEK_BUFFER) })
      }
      break
    }
    case 'queue-stats':
      if (event.payload.connectionId === get().selectedConnectionId) {
        set({ queues: event.payload.queues })
      }
      break
  }
}
