import { create } from 'zustand'
import { EventSocket } from '../lib/event-socket'
import { DEFAULT_DLQ_SUFFIXES } from '../lib/dlq'
import type { StreamEvent, UpdateStatusPayload } from '@shared/ipc'
import type {
  BindingInfo,
  ClientConnectionInfo,
  ClusterOverview,
  ConnectionConfig,
  ConnectionStatus,
  ConsumerInfo,
  CreateBindingRequest,
  CreateExchangeRequest,
  CreateQueueRequest,
  DeleteBindingRequest,
  DeleteMessageRequest,
  DeleteQueueRequest,
  ExchangeInfo,
  MoveMessageRequest,
  MoveMessagesRequest,
  NodeInfo,
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

/** Bounds for the per-tab peek buffer ("max messages to show" setting). When a
 * tab hits the cap, the oldest message drops off as new ones arrive. */
const MAX_MESSAGES_MIN = 10
const MAX_MESSAGES_MAX = 9999
const MAX_MESSAGES_DEFAULT = 1000

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
  | {
      id: string
      kind: 'connections'
      connectionId: string
      title: string
      clientConnections: ClientConnectionInfo[]
      consumers: ConsumerInfo[]
    }

export const overviewTabId = (c: string): string => `o:${c}`
export const queueTabId = (c: string, q: string): string => `q:${c}:${q}`
export const exchangeTabId = (c: string, x: string): string => `x:${c}:${x}`
export const connectionsTabId = (c: string): string => `c:${c}`

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
  /** Per-connection cluster summary + node health (pushed via cluster-stats). */
  clusterByConn: Record<string, { overview: ClusterOverview; nodes: NodeInfo[] }>
  /** Tree group collapse state (under the active connection). */
  queuesCollapsed: boolean
  exchangesCollapsed: boolean

  /** Open editor tabs and the active one. */
  tabs: EditorTab[]
  activeTabId: string | null

  /** Connection editor modal. `editing` null + open ⇒ creating a new one. */
  dialogOpen: boolean
  editing: SafeConnectionConfig | null
  /** Parsed candidates for the import dialog (null = closed). Passwords are set
   * by the user in that dialog before saving. */
  importDialog: SafeConnectionConfig[] | null

  /** Target of the open Move dialog (null = closed). Carries the connection so a
   * move launched from a background-connection tab is correct; `fingerprint` set
   * ⇒ move a single message, absent ⇒ bulk-move the whole queue. */
  moveDialog: { connectionId: string; queue: string; fingerprint?: string } | null
  /** Target of the open Publish-message dialog (null = closed). */
  publishDialog: { connectionId: string; exchange: string } | null
  /** Target of the open Create-queue dialog (null = closed). */
  createQueueDialog: { connectionId: string } | null
  /** Target of the open Delete-queue dialog (null = closed). */
  deleteQueueDialog: { connectionId: string; queue: string } | null
  /** Target of the open Create-exchange dialog (null = closed). */
  createExchangeDialog: { connectionId: string } | null
  /** Target of the open Add-binding dialog (null = closed); `source` is the exchange. */
  bindingDialog: { connectionId: string; source: string } | null
  /** Last-used move destination per source queue (persisted), for default values. */
  lastMoveTargets: Record<string, MoveTarget>

  /** Sidebar layout: persisted width and collapse state. */
  sidebarWidth: number
  sidebarVisible: boolean
  /** Persisted height of the message-detail pane in the peek view. */
  peekPaneHeight: number
  /** Persisted height of the detail pane in the cross-tab search popup. */
  searchPaneHeight: number
  /** Persisted width of the properties column in the message-detail pane. */
  detailMetaWidth: number
  /** Persisted properties-column width in the search popup's detail pane. */
  searchDetailMetaWidth: number
  /** Active color theme (persisted; first run follows the OS). */
  theme: Theme

  /** Settings modal open state. */
  settingsOpen: boolean
  /** Cross-tab message search popup open state. */
  searchOpen: boolean
  /** Max peeked messages retained per queue tab (oldest dropped past this). */
  maxMessages: number
  /** Name suffixes that mark a queue as a dead-letter queue (user-customizable). */
  dlqSuffixes: string[]
  /** Whether purge/delete prompt for confirmation first. */
  confirmDestructive: boolean
  /** Whether saved connections auto-connect when the app launches. */
  autoConnectOnLaunch: boolean
  /** Whether available updates auto-download (mirrors the main-owned pref). */
  autoDownloadUpdates: boolean

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
  /** Make a connection the expanded tree selection (connecting if needed) WITHOUT
   * opening a tab — used by keyboard arrow-expand. */
  revealConnection(id: string): Promise<void>

  // editor tabs
  openOverviewTab(connectionId: string): void
  openQueueTab(connectionId: string, queue: string): void
  openExchangeTab(connectionId: string, exchange: string): Promise<void>
  /** Open (or focus) the cluster's client-connections & consumers tab. */
  openConnectionsTab(connectionId: string): Promise<void>
  /** Force-close a client connection, then refresh the connections tab. */
  closeClientConnection(connectionId: string, name: string): Promise<OperationResult>
  /** Open a tab for every queue on a connection. */
  openAllQueueTabs(connectionId: string): void
  /** Close every open queue tab belonging to a connection. */
  closeAllQueueTabs(connectionId: string): void
  setActiveTab(id: string): void
  closeTab(id: string): void
  closeAllTabs(): void
  closeTabsToRight(id: string): void
  moveTab(id: string, to: 'left' | 'right' | 'start' | 'end'): void
  reorderTab(id: string, toIndex: number): void
  refreshTab(id: string): Promise<void>
  selectTabMessage(tabId: string, messageId: string | null): void

  refreshQueues(connectionId?: string): Promise<void>
  /** One-off fetch of cluster overview + nodes (e.g. on overview-tab open), so the
   * panel is populated before the first cluster-stats poll arrives. */
  refreshCluster(connectionId: string): Promise<void>
  /** Run a deep health probe (aliveness round-trip) and report via a toast. */
  checkHealth(connectionId: string): Promise<void>
  purgeQueue(queue: string, connectionId?: string): Promise<OperationResult>
  openCreateQueueDialog(connectionId?: string): void
  closeCreateQueueDialog(): void
  createQueue(req: CreateQueueRequest): Promise<OperationResult>
  openDeleteQueueDialog(queue: string, connectionId?: string): void
  closeDeleteQueueDialog(): void
  deleteQueue(req: DeleteQueueRequest): Promise<OperationResult>
  openMoveDialog(queue: string, connectionId?: string, fingerprint?: string): void
  closeMoveDialog(): void
  moveMessages(req: MoveMessagesRequest): Promise<OperationResult>
  moveMessage(req: MoveMessageRequest): Promise<OperationResult>
  deleteMessage(req: DeleteMessageRequest): Promise<OperationResult>

  refreshExchanges(connectionId?: string): Promise<void>
  deleteExchange(name: string, connectionId?: string): Promise<OperationResult>
  openCreateExchangeDialog(connectionId?: string): void
  closeCreateExchangeDialog(): void
  createExchange(req: CreateExchangeRequest): Promise<OperationResult>
  /** Re-fetch the bindings of an open exchange tab (after add/delete binding). */
  refreshExchangeBindings(connectionId: string, exchange: string): Promise<void>
  openBindingDialog(source: string, connectionId?: string): void
  closeBindingDialog(): void
  createBinding(req: CreateBindingRequest): Promise<OperationResult>
  deleteBinding(req: DeleteBindingRequest): Promise<OperationResult>
  toggleQueuesCollapsed(): void
  toggleExchangesCollapsed(): void
  openPublishDialog(exchange: string, connectionId?: string): void
  closePublishDialog(): void
  publishMessage(req: PublishMessageRequest): Promise<OperationResult>

  setSidebarWidth(width: number): void
  toggleSidebar(): void
  setPeekPaneHeight(height: number): void
  setSearchPaneHeight(height: number): void
  setDetailMetaWidth(width: number): void
  setSearchDetailMetaWidth(width: number): void
  setTheme(theme: Theme): void
  toggleTheme(): void

  // settings
  openSettings(): void
  closeSettings(): void
  openSearch(): void
  closeSearch(): void
  setMaxMessages(n: number): void
  setDlqSuffixes(suffixes: string[]): void
  setConfirmDestructive(on: boolean): void
  setAutoConnectOnLaunch(on: boolean): void
  setAutoDownloadUpdates(on: boolean): void
  /** Confirm only when confirm-before-destructive is on; otherwise resolve true. */
  maybeConfirm(req: ConfirmRequest): Promise<boolean>

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
  /** Export all saved connections (passwords excluded) to a JSON file. */
  exportConnections(): Promise<void>
  /** Pick a JSON file and open the import dialog with its connections. */
  startImport(): Promise<void>
  closeImport(): void
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

/** Zero a just-purged queue's counts until the broker's ~5s-lagged stats catch up,
 * so a refresh or pushed `queue-stats` event doesn't briefly re-show the pre-purge
 * count. Shared by `refreshQueues` and the `queue-stats` reducer. */
function applyPurgeGrace(cid: string, queues: QueueInfo[]): QueueInfo[] {
  const now = Date.now()
  return queues.map((q) => {
    const key = `${cid}:${q.name}`
    const t = purgedAt.get(key)
    if (t && now - t < PURGE_GRACE_MS) {
      return { ...q, messages: 0, messagesReady: 0, messagesUnacknowledged: 0 }
    }
    if (t) purgedAt.delete(key)
    return q
  })
}

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
const initialSearchPaneHeight = clampPaneHeight(
  Number(localStorage.getItem('rw.searchPaneHeight')) || 300
)

const DETAIL_META_MIN = 160
const DETAIL_META_MAX = 640
const clampMetaWidth = (w: number): number =>
  Math.min(DETAIL_META_MAX, Math.max(DETAIL_META_MIN, Math.round(w)))
const initialDetailMetaWidth = clampMetaWidth(Number(localStorage.getItem('rw.detailMetaWidth')) || 320)
const initialSearchDetailMetaWidth = clampMetaWidth(
  Number(localStorage.getItem('rw.searchDetailMetaWidth')) || 320
)

const MAX_MESSAGES_KEY = 'rw.maxMessages'
const clampMaxMessages = (n: number): number =>
  Math.min(MAX_MESSAGES_MAX, Math.max(MAX_MESSAGES_MIN, Math.round(n)))
const initialMaxMessages = clampMaxMessages(
  Number(localStorage.getItem(MAX_MESSAGES_KEY)) || MAX_MESSAGES_DEFAULT
)

const DLQ_SUFFIXES_KEY = 'rw.dlqSuffixes'
function loadDlqSuffixes(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DLQ_SUFFIXES_KEY) ?? 'null')
    if (Array.isArray(raw)) {
      const cleaned = raw.map((s) => String(s).trim()).filter(Boolean)
      if (cleaned.length > 0) return cleaned
    }
  } catch {
    // fall through to defaults
  }
  return [...DEFAULT_DLQ_SUFFIXES]
}

const CONFIRM_DESTRUCTIVE_KEY = 'rw.confirmDestructive'
const initialConfirmDestructive = localStorage.getItem(CONFIRM_DESTRUCTIVE_KEY) !== 'false'

const AUTO_CONNECT_KEY = 'rw.autoConnect'
const initialAutoConnect = localStorage.getItem(AUTO_CONNECT_KEY) === 'true'

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
  clusterByConn: {},
  queuesCollapsed: false,
  exchangesCollapsed: false,
  tabs: [],
  activeTabId: null,
  dialogOpen: false,
  editing: null,
  importDialog: null,
  moveDialog: null,
  publishDialog: null,
  createQueueDialog: null,
  deleteQueueDialog: null,
  createExchangeDialog: null,
  bindingDialog: null,
  lastMoveTargets: loadMoveTargets(),
  sidebarWidth: initialSidebarWidth,
  sidebarVisible: true,
  peekPaneHeight: initialPeekPaneHeight,
  searchPaneHeight: initialSearchPaneHeight,
  detailMetaWidth: initialDetailMetaWidth,
  searchDetailMetaWidth: initialSearchDetailMetaWidth,
  theme: initialTheme,
  settingsOpen: false,
  searchOpen: false,
  maxMessages: initialMaxMessages,
  dlqSuffixes: loadDlqSuffixes(),
  confirmDestructive: initialConfirmDestructive,
  autoConnectOnLaunch: initialAutoConnect,
  autoDownloadUpdates: false,
  updateStatus: null,
  toasts: [],
  confirmRequest: null,
  aboutOpen: false,

  async init() {
    if (initialized) return
    initialized = true
    // Mirror the resolved theme to main so the next launch opens with the right
    // window background (no white flash) even if the user never toggles it.
    void window.api.persistTheme(get().theme)
    // Mirror the main-owned auto-download pref into the store for the Settings UI.
    void window.api
      .getUpdatePrefs()
      .then((p) => set({ autoDownloadUpdates: p.autoDownload }))
      .catch(() => {
        /* keep the default (false) if the pref can't be read */
      })
    socket = new EventSocket((event) => applyStreamEvent(set, get, event))
    await socket.connect()
    await get().refreshConnections()
    // Optionally reconnect every saved cluster on launch (last one ends up selected).
    if (get().autoConnectOnLaunch) {
      for (const c of get().connections) void get().connectConnection(c.id)
    }
    // Live queue stats are pushed by the main process for every connected cluster
    // (the `queue-stats` event, folded in by applyStreamEvent) — no renderer poll.
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

  async revealConnection(id) {
    // Expand to reveal children without opening a tab. Connecting (when needed)
    // already selects + un-collapses; for an already-connected one just re-select.
    if (get().statuses[id]?.state === 'connected') {
      set({ selectedConnectionId: id, connectionCollapsed: false })
    } else {
      await get().connectConnection(id)
    }
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

  openAllQueueTabs(connectionId) {
    // Add a tab for each not-already-open queue in ONE update — looping
    // openQueueTab would re-activate (and clear unread on) every existing tab.
    const queues = get().queuesByConn[connectionId] ?? []
    const existing = new Set(get().tabs.map((t) => t.id))
    const connName = get().connections.find((c) => c.id === connectionId)?.name ?? connectionId
    const newTabs: EditorTab[] = []
    const toPeek: string[] = []
    for (const q of queues) {
      const id = queueTabId(connectionId, q.name)
      if (existing.has(id)) continue
      newTabs.push({
        id,
        kind: 'queue',
        connectionId,
        queue: q.name,
        title: `${connName} - ${q.name}`,
        peeks: [],
        selectedMessageId: null,
        unread: 0
      })
      toPeek.push(q.name)
    }
    if (newTabs.length === 0) return
    set({ tabs: [...get().tabs, ...newTabs], activeTabId: newTabs[newTabs.length - 1].id })
    for (const name of toPeek) void window.api.startPeek(connectionId, name)
  },

  closeAllQueueTabs(connectionId) {
    const { tabs, activeTabId } = get()
    const doomed = tabs.filter((t) => t.kind === 'queue' && t.connectionId === connectionId)
    if (doomed.length === 0) return
    for (const t of doomed) stopTabPeek(t)
    const remaining = tabs.filter((t) => !doomed.includes(t))
    const activeAlive = remaining.some((t) => t.id === activeTabId)
    set({
      tabs: remaining,
      activeTabId: activeAlive ? activeTabId : (remaining[remaining.length - 1]?.id ?? null)
    })
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

  async openConnectionsTab(connectionId) {
    const id = connectionsTabId(connectionId)
    if (get().tabs.some((t) => t.id === id)) {
      set({ activeTabId: id })
      await get().refreshTab(id)
      return
    }
    const connName = get().connections.find((c) => c.id === connectionId)?.name ?? connectionId
    set({
      tabs: [
        ...get().tabs,
        { id, kind: 'connections', connectionId, title: `${connName} - Connections`, clientConnections: [], consumers: [] }
      ],
      activeTabId: id
    })
    await get().refreshTab(id)
  },

  async closeClientConnection(connectionId, name) {
    const result = await window.api.closeClientConnection(connectionId, name)
    if (result.ok) {
      get().addToast('success', `Closed connection "${name}".`)
      await get().refreshTab(connectionsTabId(connectionId))
    } else {
      get().addToast('error', `Close failed: ${result.error ?? 'unknown error'}`)
    }
    return result
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
    } else if (tab.kind === 'connections') {
      try {
        const [clientConnections, consumers] = await Promise.all([
          window.api.listClientConnections(tab.connectionId),
          window.api.listConsumers(tab.connectionId)
        ])
        set({
          tabs: get().tabs.map((t) =>
            t.id === id && t.kind === 'connections' ? { ...t, clientConnections, consumers } : t
          )
        })
      } catch {
        // leave lists as-is
      }
    } else {
      await Promise.all([
        get().refreshQueues(tab.connectionId),
        get().refreshCluster(tab.connectionId)
      ])
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
      set({ queuesByConn: { ...get().queuesByConn, [cid]: applyPurgeGrace(cid, fresh) } })
    } catch {
      set({ queuesByConn: { ...get().queuesByConn, [cid]: [] } })
    }
  },

  async refreshCluster(connectionId) {
    try {
      const overview = await window.api.getOverview(connectionId)
      // /nodes needs the monitoring tag — best-effort so the overview still shows.
      const nodes = await window.api.getNodes(connectionId).catch(() => [])
      set({ clusterByConn: { ...get().clusterByConn, [connectionId]: { overview, nodes } } })
    } catch {
      // Transient; the cluster-stats poll will refill once the broker responds.
    }
  },

  async checkHealth(connectionId) {
    const name = get().connections.find((c) => c.id === connectionId)?.name ?? 'broker'
    get().addToast('info', `Checking health of "${name}"…`)
    try {
      const result = await window.api.checkHealth(connectionId)
      if (result.ok) {
        get().addToast(
          'success',
          `"${name}" is healthy — round-tripped a test message on its vhost.`
        )
      } else {
        get().addToast('error', `"${name}" health check failed: ${result.error ?? 'unknown error'}`)
      }
    } catch (err) {
      // e.g. the connection dropped between opening the menu and clicking.
      get().addToast(
        'error',
        `"${name}" health check failed: ${err instanceof Error ? err.message : String(err)}`
      )
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

  openCreateQueueDialog(connectionId) {
    const cid = connectionId ?? get().selectedConnectionId
    if (!cid) return
    set({ createQueueDialog: { connectionId: cid } })
  },

  closeCreateQueueDialog() {
    set({ createQueueDialog: null })
  },

  async createQueue(req) {
    const result = await window.api.createQueue(req)
    if (result.ok) {
      set({ createQueueDialog: null })
      await get().refreshQueues(req.connectionId)
    }
    return result
  },

  openDeleteQueueDialog(queue, connectionId) {
    const cid = connectionId ?? get().selectedConnectionId
    if (!cid) return
    set({ deleteQueueDialog: { connectionId: cid, queue } })
  },

  closeDeleteQueueDialog() {
    set({ deleteQueueDialog: null })
  },

  async deleteQueue(req) {
    // main releases the peeker before deleting (see ClusterConnection).
    const result = await window.api.deleteQueue(req)
    if (result.ok) {
      set({ deleteQueueDialog: null })
      get().closeTab(queueTabId(req.connectionId, req.name))
      await get().refreshQueues(req.connectionId)
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

  openCreateExchangeDialog(connectionId) {
    const cid = connectionId ?? get().selectedConnectionId
    if (!cid) return
    set({ createExchangeDialog: { connectionId: cid } })
  },

  closeCreateExchangeDialog() {
    set({ createExchangeDialog: null })
  },

  async createExchange(req) {
    const result = await window.api.createExchange(req)
    if (result.ok) {
      set({ createExchangeDialog: null })
      await get().refreshExchanges(req.connectionId)
    }
    return result
  },

  async refreshExchangeBindings(connectionId, exchange) {
    const id = exchangeTabId(connectionId, exchange)
    if (!get().tabs.some((t) => t.id === id)) return
    try {
      const bindings = await window.api.listExchangeBindings(connectionId, exchange)
      set({
        tabs: get().tabs.map((t) => (t.id === id && t.kind === 'exchange' ? { ...t, bindings } : t))
      })
    } catch {
      // leave bindings as-is
    }
  },

  openBindingDialog(source, connectionId) {
    const cid = connectionId ?? get().selectedConnectionId
    if (!cid) return
    set({ bindingDialog: { connectionId: cid, source } })
  },

  closeBindingDialog() {
    set({ bindingDialog: null })
  },

  async createBinding(req) {
    const result = await window.api.createBinding(req)
    if (result.ok) {
      set({ bindingDialog: null })
      await get().refreshExchangeBindings(req.connectionId, req.source)
    }
    return result
  },

  async deleteBinding(req) {
    const result = await window.api.deleteBinding(req)
    if (result.ok) {
      await get().refreshExchangeBindings(req.connectionId, req.source)
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

  setSearchPaneHeight(height) {
    const h = clampPaneHeight(height)
    localStorage.setItem('rw.searchPaneHeight', String(h))
    set({ searchPaneHeight: h })
  },

  setDetailMetaWidth(width) {
    const w = clampMetaWidth(width)
    localStorage.setItem('rw.detailMetaWidth', String(w))
    set({ detailMetaWidth: w })
  },

  setSearchDetailMetaWidth(width) {
    const w = clampMetaWidth(width)
    localStorage.setItem('rw.searchDetailMetaWidth', String(w))
    set({ searchDetailMetaWidth: w })
  },

  setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme)
    applyTheme(theme)
    set({ theme })
    // Remember it main-side too, for the next launch's window background.
    void window.api.persistTheme(theme)
  },

  toggleTheme() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  },

  openSettings() {
    set({ settingsOpen: true })
  },

  closeSettings() {
    set({ settingsOpen: false })
  },

  openSearch() {
    set({ searchOpen: true })
  },

  closeSearch() {
    set({ searchOpen: false })
  },

  setMaxMessages(n) {
    const max = clampMaxMessages(n)
    localStorage.setItem(MAX_MESSAGES_KEY, String(max))
    // Trim any over-cap buffers immediately so lowering the limit takes effect now.
    set({
      maxMessages: max,
      tabs: get().tabs.map((t) =>
        t.kind === 'queue' && t.peeks.length > max ? { ...t, peeks: t.peeks.slice(0, max) } : t
      )
    })
  },

  setDlqSuffixes(suffixes) {
    // Normalize: trim, drop blanks, de-dupe (case-insensitive); fall back to defaults.
    const seen = new Set<string>()
    const cleaned: string[] = []
    for (const s of suffixes) {
      const v = s.trim()
      const key = v.toLowerCase()
      if (v && !seen.has(key)) {
        seen.add(key)
        cleaned.push(v)
      }
    }
    const next = cleaned.length > 0 ? cleaned : [...DEFAULT_DLQ_SUFFIXES]
    localStorage.setItem(DLQ_SUFFIXES_KEY, JSON.stringify(next))
    set({ dlqSuffixes: next })
  },

  setConfirmDestructive(on) {
    localStorage.setItem(CONFIRM_DESTRUCTIVE_KEY, String(on))
    set({ confirmDestructive: on })
  },

  setAutoConnectOnLaunch(on) {
    localStorage.setItem(AUTO_CONNECT_KEY, String(on))
    set({ autoConnectOnLaunch: on })
  },

  setAutoDownloadUpdates(on) {
    set({ autoDownloadUpdates: on })
    // Revert the toggle if main couldn't persist it, so the UI matches the truth.
    window.api.setAutoDownload(on).catch(() => {
      set({ autoDownloadUpdates: !on })
      get().addToast('error', 'Could not save the auto-download setting.')
    })
  },

  maybeConfirm(req) {
    return get().confirmDestructive ? get().confirm(req) : Promise.resolve(true)
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
      // Settle any in-flight confirm as cancelled so its promise never leaks.
      confirmResolver?.(false)
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
  },

  async exportConnections() {
    const r = await window.api.exportConnections()
    if (r.ok) get().addToast('success', `Exported ${r.count} connection${r.count === 1 ? '' : 's'}.`)
    else if (!r.canceled) get().addToast('error', `Export failed: ${r.error ?? 'unknown error'}`)
  },

  async startImport() {
    const r = await window.api.importConnections()
    if (r.ok && r.connections) set({ importDialog: r.connections })
    else if (!r.canceled) get().addToast('error', `Import failed: ${r.error ?? 'unknown error'}`)
  },

  closeImport() {
    set({ importDialog: null })
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
            peeks: [event.payload, ...t.peeks].slice(0, get().maxMessages),
            unread: t.id === activeTabId ? t.unread : t.unread + 1
          }
        })
      })
      break
    }
    case 'queue-stats':
      set({
        queuesByConn: {
          ...get().queuesByConn,
          [event.payload.connectionId]: applyPurgeGrace(
            event.payload.connectionId,
            event.payload.queues
          )
        }
      })
      break
    case 'cluster-stats':
      set({
        clusterByConn: {
          ...get().clusterByConn,
          [event.payload.connectionId]: {
            overview: event.payload.overview,
            nodes: event.payload.nodes
          }
        }
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
