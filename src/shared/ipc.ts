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
  ConnectionConfig,
  DeleteMessageRequest,
  ExchangeInfo,
  MoveMessageRequest,
  MoveMessagesRequest,
  OperationResult,
  PeekedMessage,
  PublishMessageRequest,
  QueueInfo,
  SafeConnectionConfig
} from './types'

export const IPC = {
  // connection management
  listConnections: 'connections:list',
  saveConnection: 'connections:save',
  deleteConnection: 'connections:delete',
  connect: 'connections:connect',
  disconnect: 'connections:disconnect',

  // queue inspection / management (RabbitMQ management HTTP API)
  listQueues: 'queues:list',
  purgeQueue: 'queues:purge',

  // exchange inspection / management (RabbitMQ management HTTP API)
  listExchanges: 'exchanges:list',
  listExchangeBindings: 'exchanges:bindings',
  deleteExchange: 'exchanges:delete',
  publishMessage: 'exchanges:publish',

  // message-level operations (AMQP)
  startPeek: 'peek:start',
  stopPeek: 'peek:stop',
  moveMessages: 'messages:move',
  moveMessage: 'messages:moveOne',
  deleteMessage: 'messages:deleteOne',

  // event stream bootstrap
  getEventStreamPort: 'events:port',

  // app lifecycle
  quitApp: 'app:quit'
} as const

/** The API surface the preload exposes on `window.api`. */
export interface RabbitApi {
  listConnections(): Promise<SafeConnectionConfig[]>
  saveConnection(config: ConnectionConfig): Promise<SafeConnectionConfig>
  deleteConnection(id: string): Promise<void>
  connect(id: string): Promise<void>
  disconnect(id: string): Promise<void>

  listQueues(connectionId: string): Promise<QueueInfo[]>
  purgeQueue(connectionId: string, queue: string): Promise<OperationResult>

  listExchanges(connectionId: string): Promise<ExchangeInfo[]>
  listExchangeBindings(connectionId: string, exchange: string): Promise<BindingInfo[]>
  deleteExchange(connectionId: string, exchange: string): Promise<OperationResult>
  publishMessage(request: PublishMessageRequest): Promise<OperationResult>

  /** Begin streaming live (NACK-and-requeue) peeks of `queue` over the event socket. */
  startPeek(connectionId: string, queue: string): Promise<void>
  stopPeek(connectionId: string, queue: string): Promise<void>
  moveMessages(request: MoveMessagesRequest): Promise<OperationResult>
  /** Move one peeked message (by fingerprint) to a target exchange/routing key. */
  moveMessage(request: MoveMessageRequest): Promise<OperationResult>
  /** Delete one peeked message (by fingerprint) from its queue. */
  deleteMessage(request: DeleteMessageRequest): Promise<OperationResult>

  /** Port of the localhost WebSocket carrying the live event stream. */
  getEventStreamPort(): Promise<number>

  /** Quit the whole application. */
  quitApp(): Promise<void>

  /** Write text to the system clipboard. Handled in the preload — no IPC. */
  copyText(text: string): void
}

/** Discriminated union of everything pushed over the event WebSocket. */
export type StreamEvent =
  | { type: 'connection-status'; payload: import('./types').ConnectionStatus }
  | { type: 'peek'; payload: PeekedMessage }
  | { type: 'queue-stats'; payload: { connectionId: string; queues: QueueInfo[] } }
