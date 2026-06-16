/**
 * Domain types shared across the Electron main process, preload bridge and the
 * React renderer. Keep this file free of any Node or browser specific imports so
 * it can be bundled into every target.
 */

/** Stored configuration for a single RabbitMQ cluster the user can connect to. */
export interface ConnectionConfig {
  id: string
  name: string
  /** Hostname or IP of the broker, e.g. "rabbit.prod.internal". */
  host: string
  /** AMQP port used for message-level operations (peek / move). Default 5672. */
  amqpPort: number
  /** HTTP port the management plugin listens on. Default 15672. */
  managementPort: number
  vhost: string
  username: string
  /** Stored via the OS-level credential vault, never in plain config. */
  password: string
  /** Use amqps:// + https:// when true. */
  tls: boolean
}

/** A connection config without secrets, safe to ship to the renderer. */
export type SafeConnectionConfig = Omit<ConnectionConfig, 'password'>

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ConnectionStatus {
  connectionId: string
  state: ConnectionState
  /** Populated when state is "error". */
  error?: string
}

/** Subset of the RabbitMQ management API queue payload that the UI renders. */
export interface QueueInfo {
  name: string
  vhost: string
  durable: boolean
  /** "running" | "idle" | "flow" | ... as reported by the broker. */
  state: string
  messages: number
  messagesReady: number
  messagesUnacknowledged: number
  consumers: number
  /** Heuristic: name matches the configured DLQ pattern (e.g. ends in ".dlq"). */
  isDeadLetter: boolean
}

/** A single message captured while peeking a queue. */
export interface PeekedMessage {
  /** Stable id assigned by the peeker (delivery tag + counter). */
  id: string
  /** Content-based identity used to locate this exact message for move/delete
   * (publisher `messageId`, else a hash of body + routing key + correlationId).
   * Matches the peeker's de-dup key. */
  fingerprint: string
  connectionId: string
  queue: string
  exchange: string
  routingKey: string
  redelivered: boolean
  /** UTF-8 decoded body. Binary payloads are base64-encoded with isBinary=true. */
  payload: string
  isBinary: boolean
  properties: Record<string, unknown>
  headers: Record<string, unknown>
  /** Epoch millis when the peeker observed the message. */
  observedAt: number
}

export interface MoveMessagesRequest {
  connectionId: string
  sourceQueue: string
  /** Exchange to republish to; "" means the default exchange. */
  targetExchange: string
  /** Routing key to republish with. */
  targetRoutingKey: string
  /** Maximum messages to move in this batch; undefined drains the queue. */
  limit?: number
}

/** Move a single peeked message (identified by fingerprint) to a target. */
export interface MoveMessageRequest {
  connectionId: string
  sourceQueue: string
  /** {@link PeekedMessage.fingerprint} of the message to move. */
  fingerprint: string
  targetExchange: string
  targetRoutingKey: string
}

/** Delete (consume + drop) a single peeked message, identified by fingerprint. */
export interface DeleteMessageRequest {
  connectionId: string
  sourceQueue: string
  /** {@link PeekedMessage.fingerprint} of the message to delete. */
  fingerprint: string
}

export interface OperationResult {
  ok: boolean
  /** Number of messages affected (purged, moved, ...). For publish: 1 if routed. */
  affected: number
  error?: string
}

/** Subset of the management API exchange payload the UI renders. */
export interface ExchangeInfo {
  /** Empty string for the AMQP default exchange. */
  name: string
  vhost: string
  /** direct | fanout | topic | headers | ... */
  type: string
  durable: boolean
  autoDelete: boolean
  internal: boolean
}

/** A binding from an exchange (source) to a queue or another exchange. */
export interface BindingInfo {
  source: string
  destination: string
  destinationType: 'queue' | 'exchange'
  routingKey: string
  arguments: Record<string, unknown>
}

export interface PublishMessageRequest {
  connectionId: string
  /** Exchange to publish to; "" is the default exchange. */
  exchange: string
  routingKey: string
  payload: string
  payloadEncoding: 'string' | 'base64'
  /** Application headers — sent inside properties.headers. */
  headers: Record<string, unknown>
  /** AMQP message properties (delivery_mode, content_type, correlation_id, ...). */
  properties: Record<string, unknown>
}
