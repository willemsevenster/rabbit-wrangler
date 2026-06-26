/**
 * The IPC contract between renderer and main.
 *
 * Two transports are used (see CLAUDE.md / docs):
 *   - IPC `invoke` channels for request/response commands (this file).
 *   - A localhost WebSocket for the high-frequency, server-pushed event stream
 *     (live peeked messages, connection status, queue stat deltas).
 *
 * `IPC` holds the channel name constants; `RabbitApi` is the shape exposed on
 * `window.api` by the preload bridge. Both sides import from here so the
 * contract cannot drift.
 */
import type {
  BindingInfo,
  ClientConnectionInfo,
  ClusterOverview,
  ConnectionConfig,
  ConsumerInfo,
  CreateBindingRequest,
  DefinitionsPreview,
  CreateExchangeRequest,
  CreateQueueRequest,
  DeleteBindingRequest,
  DeleteMessageRequest,
  DeleteQueueRequest,
  ExchangeInfo,
  ExportMessagesRequest,
  ExportResult,
  HealthResult,
  ImportResult,
  MoveMessageRequest,
  MoveMessagesRequest,
  NodeInfo,
  OperationResult,
  PeekedMessage,
  PublishMessageRequest,
  QueueInfo,
  SafeConnectionConfig,
  SaveMessagesRequest
} from './types'

export const IPC = {
  // connection management
  listConnections: 'connections:list',
  saveConnection: 'connections:save',
  deleteConnection: 'connections:delete',
  connect: 'connections:connect',
  disconnect: 'connections:disconnect',
  exportConnections: 'connections:export',
  importConnections: 'connections:import',

  // topology definitions (RabbitMQ management HTTP API, vhost-scoped)
  exportDefinitions: 'definitions:export',
  previewImportDefinitions: 'definitions:preview',
  importDefinitions: 'definitions:import',

  // cluster health (RabbitMQ management HTTP API)
  getOverview: 'cluster:overview',
  getNodes: 'cluster:nodes',
  checkHealth: 'cluster:health',

  // client connections & consumers (RabbitMQ management HTTP API)
  listClientConnections: 'broker:connections',
  listConsumers: 'broker:consumers',
  closeClientConnection: 'broker:close-connection',

  // queue inspection / management (RabbitMQ management HTTP API)
  listQueues: 'queues:list',
  purgeQueue: 'queues:purge',
  createQueue: 'queues:create',
  deleteQueue: 'queues:delete',

  // exchange inspection / management (RabbitMQ management HTTP API)
  listExchanges: 'exchanges:list',
  listExchangeBindings: 'exchanges:bindings',
  createExchange: 'exchanges:create',
  deleteExchange: 'exchanges:delete',
  publishMessage: 'exchanges:publish',
  createBinding: 'bindings:create',
  deleteBinding: 'bindings:delete',

  // message-level operations (AMQP)
  startPeek: 'peek:start',
  stopPeek: 'peek:stop',
  moveMessages: 'messages:move',
  moveMessage: 'messages:moveOne',
  deleteMessage: 'messages:deleteOne',
  exportMessages: 'messages:export',
  saveMessages: 'messages:save',

  // event stream bootstrap
  getEventStreamPort: 'events:port',

  // ui preferences the main process needs before the renderer runs
  persistTheme: 'ui:persist-theme',

  // app lifecycle + auto-update
  quitApp: 'app:quit',
  getAppVersion: 'app:version',
  checkForUpdates: 'update:check',
  downloadUpdate: 'update:download',
  quitAndInstall: 'update:install',
  getUpdatePrefs: 'update:get-prefs',
  setAutoDownload: 'update:set-auto-download'
} as const

/** The API surface the preload exposes on `window.api`. */
export interface RabbitApi {
  listConnections(): Promise<SafeConnectionConfig[]>
  saveConnection(config: ConnectionConfig): Promise<SafeConnectionConfig>
  deleteConnection(id: string): Promise<void>
  connect(id: string): Promise<void>
  disconnect(id: string): Promise<void>
  /** Write all saved connections (passwords excluded) to a user-chosen JSON file. */
  exportConnections(): Promise<ExportResult>
  /** Read a connections JSON file (passwords excluded) for the import dialog. */
  importConnections(): Promise<ImportResult>

  /** Export the connection's vhost topology (queues/exchanges/bindings/policies) to a JSON file. */
  exportDefinitions(connectionId: string): Promise<ExportResult>
  /** Prompt for a definitions file and return a parsed summary (not yet applied). */
  previewImportDefinitions(connectionId: string): Promise<DefinitionsPreview>
  /** Apply a previously-previewed definitions file (by its preview token) to the vhost. */
  importDefinitions(connectionId: string, token: string): Promise<OperationResult>

  /** Cluster-wide summary (version, totals, rates). */
  getOverview(connectionId: string): Promise<ClusterOverview>
  /** Per-node health (memory/disk alarms, fd usage, uptime). */
  getNodes(connectionId: string): Promise<NodeInfo[]>
  /** Deep health probe: round-trips a test message on the vhost (/aliveness-test). */
  checkHealth(connectionId: string): Promise<HealthResult>

  /** Live client connections to the broker. */
  listClientConnections(connectionId: string): Promise<ClientConnectionInfo[]>
  /** Consumers on the configured vhost. */
  listConsumers(connectionId: string): Promise<ConsumerInfo[]>
  /** Force-close a client connection by name (DELETE /connections/{name}). */
  closeClientConnection(
    connectionId: string,
    name: string,
    reason?: string
  ): Promise<OperationResult>

  listQueues(connectionId: string): Promise<QueueInfo[]>
  purgeQueue(connectionId: string, queue: string): Promise<OperationResult>
  /** Declare a queue (create, or idempotently re-assert an identical one). */
  createQueue(request: CreateQueueRequest): Promise<OperationResult>
  /** Delete a whole queue and its messages, optionally guarded by if-empty/if-unused. */
  deleteQueue(request: DeleteQueueRequest): Promise<OperationResult>

  listExchanges(connectionId: string): Promise<ExchangeInfo[]>
  listExchangeBindings(connectionId: string, exchange: string): Promise<BindingInfo[]>
  /** Declare an exchange (create, or idempotently re-assert an identical one). */
  createExchange(request: CreateExchangeRequest): Promise<OperationResult>
  deleteExchange(connectionId: string, exchange: string): Promise<OperationResult>
  publishMessage(request: PublishMessageRequest): Promise<OperationResult>
  /** Bind a source exchange to a queue or another exchange. */
  createBinding(request: CreateBindingRequest): Promise<OperationResult>
  /** Remove a specific binding (by its properties key). */
  deleteBinding(request: DeleteBindingRequest): Promise<OperationResult>

  /** Begin streaming live (NACK-and-requeue) peeks of `queue` over the event socket. */
  startPeek(connectionId: string, queue: string): Promise<void>
  stopPeek(connectionId: string, queue: string): Promise<void>
  moveMessages(request: MoveMessagesRequest): Promise<OperationResult>
  /** Move one peeked message (by fingerprint) to a target exchange/routing key. */
  moveMessage(request: MoveMessageRequest): Promise<OperationResult>
  /** Delete one peeked message (by fingerprint) from its queue. */
  deleteMessage(request: DeleteMessageRequest): Promise<OperationResult>
  /** Export a queue's ready messages to a user-chosen JSON/NDJSON file (non-destructive). */
  exportMessages(request: ExportMessagesRequest): Promise<ExportResult>
  /** Save caller-supplied message records (e.g. one peeked message) to a JSON/NDJSON file. */
  saveMessages(request: SaveMessagesRequest): Promise<ExportResult>

  /** Remember the chosen theme so the next launch's window opens without a flash. */
  persistTheme(theme: 'light' | 'dark'): Promise<void>

  /** Port of the localhost WebSocket carrying the live event stream. */
  getEventStreamPort(): Promise<number>

  /** Quit the whole application. */
  quitApp(): Promise<void>

  /** App version (from package.json) — shown in the About dialog. */
  getAppVersion(): Promise<string>
  /** Trigger a user-initiated update check (result surfaces over the event socket). */
  checkForUpdates(): Promise<void>
  /** Download the available update; progress streams over the event socket. */
  downloadUpdate(): Promise<void>
  /** Quit and install the downloaded update (relaunches the app). */
  quitAndInstall(): Promise<void>
  /** Current update preferences (auto-download), read by the Settings dialog. */
  getUpdatePrefs(): Promise<UpdatePrefs>
  /** Toggle whether available updates download automatically. */
  setAutoDownload(enabled: boolean): Promise<void>

  /** Write text to the system clipboard. Handled in the preload — no IPC. */
  copyText(text: string): void
}

/** User-tunable auto-update preferences (persisted in the main process). */
export interface UpdatePrefs {
  /** When true, an available update downloads automatically (install stays manual). */
  autoDownload: boolean
}

/** Auto-update lifecycle, pushed from the main-process updater. */
export type UpdateState =
  | 'checking'
  | 'available'
  | 'none'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateStatusPayload {
  state: UpdateState
  /** Set for available / none / downloaded. */
  version?: string
  /** 0–100, set while downloading. */
  percent?: number
  /** Set for error. */
  error?: string
  /** True when the check was user-initiated, so the renderer shows feedback. */
  manual?: boolean
}

/** Discriminated union of everything pushed over the event WebSocket. */
export type StreamEvent =
  | { type: 'connection-status'; payload: import('./types').ConnectionStatus }
  | { type: 'peek'; payload: PeekedMessage }
  | { type: 'queue-stats'; payload: { connectionId: string; queues: QueueInfo[] } }
  | {
      type: 'cluster-stats'
      payload: { connectionId: string; overview: ClusterOverview; nodes: NodeInfo[] }
    }
  | { type: 'update-status'; payload: UpdateStatusPayload }
