/**
 * Domain types shared across the Electron main process, preload bridge and the
 * React renderer. Keep this file free of any Node or browser specific imports so
 * it can be bundled into every target.
 */

/** How a connection browses messages.
 * - `auto` (default): use AMQP (full peek + move/delete) when its port is
 *   reachable, otherwise fall back to the read-only HTTP browse path.
 * - `http`: always use the HTTP browse path, even when AMQP is reachable. */
export type BrowseMode = 'auto' | 'http'

/** The message transport actually in use for a live connection. `http` is a
 * read-only, polled browse (no move/delete/drain). */
export type MessageTransport = 'amqp' | 'http'

/** Runtime transport facts for a live connection, resolved on connect. */
export interface ConnectionRuntime {
  /** Whether the AMQP port was reachable when probed on connect. */
  amqpAvailable: boolean
  /** Effective transport: `http` when forced by config or AMQP is unreachable. */
  transport: MessageTransport
}

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
  /** Message-browsing preference. Absent = `auto` (prefer AMQP when available). */
  browseMode?: BrowseMode
}

/** A connection config without secrets, safe to ship to the renderer. */
export type SafeConnectionConfig = Omit<ConnectionConfig, 'password'>

/** Result of exporting connections to a JSON file (passwords excluded). */
export interface ExportResult {
  ok: boolean
  /** Absolute path written, on success. */
  path?: string
  /** Number of connections written. */
  count?: number
  /** True when the user dismissed the save dialog. */
  canceled?: boolean
  error?: string
}

/** Result of reading a connections JSON file for import (passwords excluded — the
 * user sets them in the import dialog). */
export interface ImportResult {
  ok: boolean
  connections?: SafeConnectionConfig[]
  /** True when the user dismissed the open dialog. */
  canceled?: boolean
  error?: string
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ConnectionStatus {
  connectionId: string
  state: ConnectionState
  /** Populated when state is "error". */
  error?: string
  /** Whether the AMQP port was reachable (set once connected). */
  amqpAvailable?: boolean
  /** Effective message transport once connected (`http` = read-only browse). */
  transport?: MessageTransport
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
  /** Queue memory footprint on the broker, in bytes (when reported). */
  memory?: number
  /** Net rate of queue-depth change, msgs/sec (message_stats sampling window). */
  messageRate?: number
  /** Messages published into the queue, msgs/sec. */
  publishRate?: number
  /** Messages delivered to consumers (deliver + get), msgs/sec. */
  deliverRate?: number
  /** Messages acknowledged, msgs/sec. */
  ackRate?: number
  /** ISO timestamp of the queue's last activity, when idle. */
  idleSince?: string
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

/** Declare (create or idempotently re-assert) a queue via the management API. */
export interface CreateQueueRequest {
  connectionId: string
  /** Queue name. Reserved `amq.*` names are rejected by the broker. */
  name: string
  durable: boolean
  autoDelete: boolean
  /** Queue x-arguments (e.g. x-dead-letter-exchange, x-message-ttl); empty object = none. */
  arguments: Record<string, unknown>
}

/** Delete a whole queue (and its messages), optionally only under guards. */
export interface DeleteQueueRequest {
  connectionId: string
  name: string
  /** Only delete if the queue has no messages (broker rejects otherwise). */
  ifEmpty?: boolean
  /** Only delete if the queue has no consumers (broker rejects otherwise). */
  ifUnused?: boolean
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

/** Export a queue's ready messages to a file (non-destructive snapshot). */
export interface ExportMessagesRequest {
  connectionId: string
  queue: string
  /** Max messages to export; undefined exports all currently-ready messages. */
  limit?: number
}

/** A queue message serialized for file export / clipboard copy. `payloadEncoding`
 * matches the publish contract so a record can round-trip back through publish. */
export interface ExportedMessage {
  exchange: string
  routingKey: string
  redelivered: boolean
  properties: Record<string, unknown>
  headers: Record<string, unknown>
  payload: string
  payloadEncoding: 'string' | 'base64'
  fingerprint: string
}

/** Save already-serialized message records (e.g. one peeked message) to a file. */
export interface SaveMessagesRequest {
  /** Base name suggested in the save dialog (no extension). */
  defaultName: string
  messages: ExportedMessage[]
}

/** A RabbitMQ policy applied to queues/exchanges matching a name pattern. */
export interface PolicyInfo {
  name: string
  vhost: string
  /** Regex matched against queue/exchange names. */
  pattern: string
  /** "queues" | "exchanges" | "all" (sometimes "classic_queues"/"quorum_queues"). */
  applyTo: string
  /** Policy definition (e.g. message-ttl, max-length, dead-letter-exchange, ha-mode). */
  definition: Record<string, unknown>
  priority: number
}

/** Create or update a policy (PUT /policies/{vhost}/{name}). */
export interface CreatePolicyRequest {
  connectionId: string
  name: string
  pattern: string
  applyTo: string
  definition: Record<string, unknown>
  priority: number
}

/** RabbitMQ user tags that grant management capabilities. */
export type UserTag = 'administrator' | 'monitoring' | 'policymaker' | 'management' | 'impersonator'

/** The broker user this connection authenticates as (from `GET /whoami`). */
export interface CurrentUser {
  name: string
  tags: string[]
  /** True when `tags` includes `administrator` — gates the admin surface. */
  isAdministrator: boolean
}

/** A broker user (cluster-wide), from `GET /users`. The password hash never
 * crosses to the renderer — only whether one is set. */
export interface UserInfo {
  name: string
  tags: string[]
  /** True when the user has a password set (vs. passwordless x509/SASL). */
  hasPassword: boolean
}

/** Create or update a user (`PUT /users/{name}`). */
export interface CreateUserRequest {
  connectionId: string
  name: string
  tags: string[]
  /** New plaintext password. Ignored when `keepPassword` is true. */
  password?: string
  /** On edit with no new password: re-assert the existing password hash (read
   * main-side) so a tag-only change doesn't wipe the password. */
  keepPassword?: boolean
}

/** A virtual host (cluster-wide), from `GET /vhosts`. */
export interface VhostInfo {
  name: string
  description?: string
  /** Default queue type for queues declared without an explicit type. */
  defaultQueueType?: string
  tags: string[]
  /** Total messages across the vhost's queues (when reported). */
  messages?: number
}

/** A user's permissions on a vhost (`GET /permissions`). Each field is a regex:
 * `.*` = full, `` = none. */
export interface PermissionInfo {
  vhost: string
  user: string
  configure: string
  write: string
  read: string
}

/** Set a user's permissions on a vhost (`PUT /permissions/{vhost}/{user}`). */
export interface SetPermissionRequest {
  connectionId: string
  vhost: string
  user: string
  configure: string
  write: string
  read: string
}

/** A user's topic permissions on an exchange in a vhost (`GET /topic-permissions`). */
export interface TopicPermissionInfo {
  vhost: string
  user: string
  exchange: string
  write: string
  read: string
}

/** Set a user's topic permissions for an exchange (`PUT /topic-permissions/{vhost}/{user}`). */
export interface SetTopicPermissionRequest {
  connectionId: string
  vhost: string
  user: string
  exchange: string
  write: string
  read: string
}

/** Create or update a virtual host (`PUT /vhosts/{name}`). */
export interface CreateVhostRequest {
  connectionId: string
  name: string
  description?: string
  /** "classic" | "quorum" | "stream" — blank lets the broker decide. */
  defaultQueueType?: string
}

/** Whether dynamic shovels are usable on this broker (the `rabbitmq_shovel` +
 * `rabbitmq_shovel_management` plugins). Probed lazily before offering the feature. */
export interface ShovelSupport {
  supported: boolean
  /** Why not, when unsupported (plugin disabled, permission, unreachable). */
  reason?: string
}

/** A dynamic shovel as reported by `GET /api/shovels/{vhost}`. */
export interface ShovelInfo {
  name: string
  vhost: string
  /** "running" | "starting" | "terminated" | ... as reported by the broker. */
  state: string
  /** Shovel type — "dynamic" for the ones this app creates. */
  type?: string
  /** Source/destination, when reported (varies by broker version). */
  source?: string
  destination?: string
}

/** Create a one-shot dynamic shovel that drains a queue's backlog broker-side. */
export interface CreateShovelRequest {
  connectionId: string
  /** Parameter name for the shovel (must be unique within the vhost). */
  name: string
  /** Queue to drain (the source). */
  srcQueue: string
  /** Destination exchange; "" means the default exchange (route by key to a queue). */
  destExchange: string
  /** Routing key used at the destination (and the queue name on the default exchange). */
  destRoutingKey: string
}

/** Counts of the objects in a vhost definitions document. */
export interface DefinitionsSummary {
  queues: number
  exchanges: number
  bindings: number
  policies: number
  parameters: number
}

/** Result of reading a definitions file for import (parsed + held in main, not yet applied). */
export interface DefinitionsPreview {
  ok: boolean
  /** True when the user dismissed the open dialog. */
  canceled?: boolean
  /** Opaque token for the parsed file held in main — passed back to apply the import.
   * The file path never crosses to the renderer, so it can't ask main to read an
   * arbitrary file. */
  token?: string
  summary?: DefinitionsSummary
  error?: string
}

export interface OperationResult {
  ok: boolean
  /** Number of messages affected (purged, moved, ...). For publish: 1 if routed. */
  affected: number
  error?: string
}

/** Result of a deep broker health probe (aliveness round-trip on the vhost). */
export interface HealthResult {
  ok: boolean
  error?: string
}

/** A live client connection to the broker (management API `/connections`). */
export interface ClientConnectionInfo {
  /** Unique connection name, e.g. "10.0.0.4:51234 -> 10.0.0.1:5672". Used to close it. */
  name: string
  user: string
  vhost: string
  /** Remote peer host:port. */
  peer: string
  /** amqp 0-9-1 | amqp 1.0 | ... */
  protocol: string
  /** Open channel count on this connection. */
  channels: number
  /** "running" | "blocked" | "blocking" | ... */
  state: string
  tls: boolean
  /** Epoch millis the connection was established (when reported). */
  connectedAt?: number
  /** Client-reported name/product, when advertised (connection_name / product). */
  clientName?: string
}

/** A consumer subscribed to a queue (management API `/consumers`). */
export interface ConsumerInfo {
  queue: string
  consumerTag: string
  /** Connection the consuming channel belongs to (for cross-referencing / closing). */
  connectionName?: string
  /** True when the consumer requires acks (manual ack mode). */
  ackRequired: boolean
  prefetchCount: number
  /** False when the broker has paused delivery to this consumer (e.g. SAC standby). */
  active: boolean
  exclusive: boolean
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
  /** RabbitMQ's per-binding key from the bindings listing; needed to delete this
   * binding. Absent only when the broker omits it (then deletion isn't offered). */
  propertiesKey?: string
}

/** Declare (create or idempotently re-assert) an exchange via the management API. */
export interface CreateExchangeRequest {
  connectionId: string
  /** Exchange name. Reserved `amq.*` names are rejected by the broker. */
  name: string
  /** direct | fanout | topic | headers */
  type: string
  durable: boolean
  autoDelete: boolean
  internal: boolean
  /** Optional exchange arguments (e.g. alternate-exchange). */
  arguments: Record<string, unknown>
}

/** Create a binding from a source exchange to a queue or another exchange. */
export interface CreateBindingRequest {
  connectionId: string
  source: string
  destination: string
  destinationType: 'queue' | 'exchange'
  routingKey: string
  /** Optional binding arguments (headers-exchange matches: x-match + header values). */
  arguments: Record<string, unknown>
}

/** Delete a specific binding (addressed by its {@link BindingInfo.propertiesKey}). */
export interface DeleteBindingRequest {
  connectionId: string
  source: string
  destination: string
  destinationType: 'queue' | 'exchange'
  propertiesKey: string
}

/** Cluster-wide summary from the management API `/overview`. */
export interface ClusterOverview {
  rabbitmqVersion: string
  erlangVersion?: string
  clusterName: string
  /** Object counts across the cluster. */
  totals: {
    queues: number
    connections: number
    channels: number
    consumers: number
    exchanges: number
  }
  /** Cluster-wide message rates, msgs/sec (absent when the broker reports none). */
  rates: {
    publish?: number
    deliver?: number
    ack?: number
  }
}

/** Health of a single broker node, from the management API `/nodes`. */
export interface NodeInfo {
  name: string
  running: boolean
  /** Memory in bytes used / configured high-watermark (when reported). */
  memUsed?: number
  memLimit?: number
  /** True when the node has tripped its memory high-watermark alarm. */
  memAlarm: boolean
  /** Free disk in bytes / the configured low-watermark (when reported). */
  diskFree?: number
  diskFreeLimit?: number
  /** True when the node has tripped its free-disk alarm. */
  diskFreeAlarm: boolean
  /** File descriptors used / available (when reported). */
  fdUsed?: number
  fdTotal?: number
  /** Node uptime in milliseconds (when reported). */
  uptime?: number
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
