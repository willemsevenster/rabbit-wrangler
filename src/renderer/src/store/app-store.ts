import { create } from 'zustand'
import { EventSocket } from '../lib/event-socket'
import type { StreamEvent, UpdateStatusPayload } from '@shared/ipc'
import type {
  BindingInfo,
  ConnectionConfig,
  ConnectionStatus,
  DeleteMessageRequest,
  ExchangeInfo,
  MoveMessageRequest,
  MoveMessagesRequest,
  OperationResult,
  PeekedMessage,
  PublishMessageRequest,
  QueueInfo,
  SafeConnectionConfig
} from '@shared/types'

/** Last move destination chosen for a source queue, keyed by `${connId}:${queue}`. */
interface MoveTarget {
  exchange: string
  routingKey: string
}

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

/** A transient toast notification (auto-dismisses). */
export interface Toast {
  id: string
  kind: 'info' | 'success' | 'error'
  message: string
}

/** A request to show the themed confirm dialog. */
export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}

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

  /** Target of the open Move dialog (null = closed). Carries the connection so a
   * move launched from a background-connection tab is correct; `fingerprint` set
   * ⇒ move a single message, absent ⇒ bulk-move the whole queue. */
  moveDialog: { connectionId: string; queue: string; fingerprint?: string } | null
  /** Target of the open Publish-message dialog (null = closed). */
  publishDialog: { connectionId: string; exchange: string } | null
  /** Last-used move destination per source queue (persisted), for default values. */
  lastMoveTargets: Record<string, MoveTarget>

  /** Sidebar layout: persisted width and collapse state. */
  sidebarWidth: number
  sidebarVisible: boolean
  /** Persisted height of the message-detail pane in the peek view. */
  peekPaneHeight: number
  /** Persisted width of the properties column in the message-detail pane. */
  detailMetaWidth: number
  /** Active color theme (persisted; first run follows the OS). */
  theme: Theme

  /** Auto-update status pushed from main (null until the first event). */
  updateStatus: UpdateStatusPayload | null
  /** Transient toast notifications (auto-dismiss). */
  toasts: Toast[]
  /** Open themed confirm dialog request (null = closed). */
  confirmRequest: ConfirmRequest | null
  /** Whether the About dialog is open. */
  aboutOpen: boolean

  init(): Promise<void>
  refreshConnections(): Promise<void>
  selectConnection(id: string): Promise<void>
  connectConnection(id: string): Promise<void>
  disconnectConnection(id: string): Promise<void>
  toggleConnectionCollapsed(): void
  /** Collapse the whole tree to the connections level (global "collapse all"). */
  collapseTree(): void
  /** Fully expand one connection — its node and both groups (connects if needed). */
  expandConnection(id: string): Promise<void>
  /** Fully collapse one connection's subtree. */
  collapseConnection(id: string): void

  // editor tabs
  openOverviewTab(connectionId: string): void
  openQueueTab(connectionId: string, queue: string): void
  openExchangeTab(connectionId: string, exchange: string): Promise<void>
  setActiveTab(id: string): void
  closeTab(id: string): void
  closeAllTabs(): void
  closeTabsToRight(id: string): void
  moveTab(id: string, to: 'left' | 'right' | 'start' | 'end'): void
  reorderTab(id: string, toIndex: number): void
  refreshTab(id: string): Promise<void>
  selectTabMessage(tabId: string, messageId: string | null): void

  refreshQueues(connectionId?: string): Promise<void>
  purgeQueue(queue: string, connectionId?: string): Promise<OperationResult>
  openMoveDialog(queue: string, connectionId?: string, fingerprint?: string): void
  closeMoveDialog(): void
  moveMessages(req: MoveMessagesRequest): Promise<OperationResult>
  moveMessage(req: MoveMessageRequest): Promise<OperationResult>
  deleteMessage(req: DeleteMessageRequest): Promise<OperationResult>

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
  setDetailMetaWidth(width: number): void
  setTheme(theme: Theme): void
  toggleTheme(): void

  checkForUpdates(): void
  downloadUpdate(): void
  restartToUpdate(): Promise<void>

  addToast(kind: Toast['kind'], message: string): void
  dismissToast(id: string): void
  /** Show a themed confirm dialog; resolves true on confirm, false on cancel. */
  confirm(req: ConfirmRequest): Promise<boolean>
  resolveConfirm(ok: boolean): void
  openAbout(): void
  closeAbout(): void

  openNewConnection(): void
  editConnection(connection: SafeConnectionConfig): void
  closeDialog(): void
  saveConnection(config: ConnectionConfig): Promise<void>
  deleteConnection(id: string): Promise<void>
}

let socket: EventSocket | null = null
let initialized = false
/** Monotonic id source for toasts. */
let toastSeq = 0
/** Resolver for the in-flight themed confirm() (only one dialog at a time). */
let confirmResolver: ((ok: boolean) => void) | null = null
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

const DETAIL_META_MIN = 160
const DETAIL_META_MAX = 640
const clampMetaWidth = (w: number): number =>
  Math.min(DETAIL_META_MAX, Math.max(DETAIL_META_MIN, Math.round(w)))
const initialDetailMetaWidth = clampMetaWidth(Number(localStorage.getItem('rw.detailMetaWidth')) || 320)

type Theme = 'light' | 'dark'
const THEME_KEY = 'rw.theme'
/** Stored choice wins; first run follows the OS (prefers-color-scheme). */
function initialThemeValue(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}
const initialTheme = initialThemeValue()
function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}
// Apply before React mounts so there's no flash of the wrong theme.
applyTheme(initialTheme)

const MOVE_TARGETS_KEY = 'rw.lastMoveTargets'
const moveTargetKey = (connectionId: string, queue: string): string => `${connectionId}:${queue}`
function loadMoveTargets(): Record<string, MoveTarget> {
  try {
    return JSON.parse(localStorage.getItem(MOVE_TARGETS_KEY) ?? '{}') as Record<string, MoveTarget>
  } catch {
    return {}
  }
}

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
  lastMoveTargets: loadMoveTargets(),
  sidebarWidth: initialSidebarWidth,
  sidebarVisible: true,
  peekPaneHeight: initialPeekPaneHeight,
  detailMetaWidth: initialDetailMetaWidth,
  theme: initialTheme,
  updateStatus: null,
  toasts: [],
  confirmRequest: null,
  aboutOpen: false,

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

  collapseTree() {
    set({ connectionCollapsed: true })
  },

  async expandConnection(id) {
    // Only the selected connection's children render, so expanding makes `id` the
    // selected one (connecting first if needed), then opens its node + both groups.
    if (get().statuses[id]?.state !== 'connected') {
      await get().connectConnection(id)
    } else {
      set({ selectedConnectionId: id })
    }
    set({ connectionCollapsed: false, queuesCollapsed: false, exchangesCollapsed: false })
  },

  collapseConnection(id) {
    if (get().selectedConnectionId === id) set({ connectionCollapsed: true })
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
    const connName = get().connections.find((c) => c.id === connectionId)?.name ?? connectionId
    const tab: EditorTab = {
      id,
      kind: 'queue',
      connectionId,
      queue,
      title: `${connName} - ${queue}`,
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
    const connName = get().connections.find((c) => c.id === connectionId)?.name ?? connectionId
    const exLabel = exchange === '' ? '(AMQP default)' : exchange
    const title = `${connName} - ${exLabel}`
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
    stopTabPeek(tabs[idx])
    const remaining = tabs.filter((t) => t.id !== id)
    let nextActive = activeTabId
    if (activeTabId === id) {
      const neighbor = remaining[idx] ?? remaining[idx - 1] ?? null
      nextActive = neighbor ? neighbor.id : null
    }
    set({ tabs: remaining, activeTabId: nextActive })
  },

  closeAllTabs() {
    for (const t of get().tabs) stopTabPeek(t)
    set({ tabs: [], activeTabId: null })
  },

  closeTabsToRight(id) {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    for (const t of tabs.slice(idx + 1)) stopTabPeek(t)
    const remaining = tabs.slice(0, idx + 1)
    set({
      tabs: remaining,
      // If the active tab was one of those closed, fall back to the anchor tab.
      activeTabId: remaining.some((t) => t.id === activeTabId) ? activeTabId : id
    })
  },

  moveTab(id, to) {
    const tabs = get().tabs
    const i = tabs.findIndex((t) => t.id === id)
    if (i === -1) return
    const target =
      to === 'left' ? i - 1 : to === 'right' ? i + 1 : to === 'start' ? 0 : tabs.length - 1
    get().reorderTab(id, target)
  },

  reorderTab(id, toIndex) {
    const current = get().tabs
    const from = current.findIndex((t) => t.id === id)
    if (from === -1) return
    const target = Math.max(0, Math.min(toIndex, current.length - 1))
    if (from === target) return
    const next = [...current]
    const [moved] = next.splice(from, 1)
    next.splice(target, 0, moved)
    set({ tabs: next })
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

  openMoveDialog(queue, connectionId, fingerprint) {
    const cid = connectionId ?? get().selectedConnectionId
    if (!cid) return
    set({ moveDialog: { connectionId: cid, queue, fingerprint } })
  },

  closeMoveDialog() {
    set({ moveDialog: null })
  },

  async moveMessages(req) {
    // main releases the source peeker before draining (see ClusterConnection).
    const result = await window.api.moveMessages(req)
    if (result.ok) {
      rememberMoveTarget(set, get, req)
      set({ moveDialog: null })
      // The source was drained; clear its tab and resume its peek if open.
      afterSourceMutated(set, get, req.connectionId, req.sourceQueue)
      await get().refreshQueues(req.connectionId)
    }
    return result
  },

  async moveMessage(req) {
    const result = await window.api.moveMessage(req)
    if (result.ok) {
      rememberMoveTarget(set, get, req)
      set({ moveDialog: null })
      afterSourceMutated(set, get, req.connectionId, req.sourceQueue)
      await get().refreshQueues(req.connectionId)
    }
    return result
  },

  async deleteMessage(req) {
    const result = await window.api.deleteMessage(req)
    if (result.ok) {
      afterSourceMutated(set, get, req.connectionId, req.sourceQueue)
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

  setDetailMetaWidth(width) {
    const w = clampMetaWidth(width)
    localStorage.setItem('rw.detailMetaWidth', String(w))
    set({ detailMetaWidth: w })
  },

  setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },

  toggleTheme() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  },

  checkForUpdates() {
    void window.api.checkForUpdates()
  },

  downloadUpdate() {
    void window.api.downloadUpdate()
  },

  async restartToUpdate() {
    const v = get().updateStatus?.version
    const ok = await get().confirm({
      title: 'Restart to update',
      message: `Restart now to install Rabbit Wrangler${v ? ` ${v}` : ''}?`,
      confirmLabel: 'Restart'
    })
    if (ok) void window.api.quitAndInstall()
  },

  addToast(kind, message) {
    const id = `t${++toastSeq}`
    set({ toasts: [...get().toasts, { id, kind, message }] })
    setTimeout(() => get().dismissToast(id), 4000)
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },

  confirm(req) {
    return new Promise<boolean>((resolve) => {
      confirmResolver = resolve
      set({ confirmRequest: req })
    })
  },

  resolveConfirm(ok) {
    const resolve = confirmResolver
    confirmResolver = null
    set({ confirmRequest: null })
    resolve?.(ok)
  },

  openAbout() {
    set({ aboutOpen: true })
  },

  closeAbout() {
    set({ aboutOpen: false })
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
    // Attempt the connection right away instead of waiting for the user to click
    // it. connectConnection force-reconnects (disconnect+reconnect in main), so an
    // edit applies its new settings immediately; on success, focus its overview.
    await get().connectConnection(config.id)
    if (get().statuses[config.id]?.state === 'connected') get().openOverviewTab(config.id)
  },

  async deleteConnection(id) {
    await window.api.deleteConnection(id)
    closeTabsFor(set, get, id)
    if (get().selectedConnectionId === id) set({ selectedConnectionId: null })
    await get().refreshConnections()
  }
}))

/** Stop the broker-side peeker backing a queue tab (no-op for other kinds). */
function stopTabPeek(tab: EditorTab): void {
  if (tab.kind === 'queue') void window.api.stopPeek(tab.connectionId, tab.queue)
}

/** Reset a queue tab's accumulated context (peeks/unread/selection). */
function clearQueueTab(tabs: EditorTab[], tabId: string): EditorTab[] {
  return tabs.map((t) =>
    t.id === tabId && t.kind === 'queue'
      ? { ...t, peeks: [], unread: 0, selectedMessageId: null }
      : t
  )
}

/** Persist the chosen move destination for a source queue, for default values. */
function rememberMoveTarget(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  req: { connectionId: string; sourceQueue: string; targetExchange: string; targetRoutingKey: string }
): void {
  const targets = {
    ...get().lastMoveTargets,
    [moveTargetKey(req.connectionId, req.sourceQueue)]: {
      exchange: req.targetExchange,
      routingKey: req.targetRoutingKey
    }
  }
  try {
    localStorage.setItem(MOVE_TARGETS_KEY, JSON.stringify(targets))
  } catch {
    // storage unavailable; keep in-memory only
  }
  set({ lastMoveTargets: targets })
}

/** After a move/delete changed a queue, refresh its open tab's live peek. */
function afterSourceMutated(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  connectionId: string,
  sourceQueue: string
): void {
  const tid = queueTabId(connectionId, sourceQueue)
  if (get().tabs.some((t) => t.id === tid)) {
    set({ tabs: clearQueueTab(get().tabs, tid) })
    void window.api.startPeek(connectionId, sourceQueue)
  }
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
    if (t.connectionId === connectionId) stopTabPeek(t)
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
    case 'update-status': {
      const p = event.payload
      set({ updateStatus: p })
      // Only surface a toast for user-initiated checks — never nag mid-task.
      if (p.manual) {
        if (p.state === 'checking') get().addToast('info', 'Checking for updates…')
        else if (p.state === 'none') get().addToast('info', "You're up to date.")
        else if (p.state === 'error')
          get().addToast('error', `Update check failed: ${p.error ?? 'unknown error'}`)
      }
      break
    }
  }
}
