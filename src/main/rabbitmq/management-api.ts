import type {
  BindingInfo,
  ClientConnectionInfo,
  ClusterOverview,
  ConnectionConfig,
  ConsumerInfo,
  CreateBindingRequest,
  CreateExchangeRequest,
  CreatePolicyRequest,
  CreateQueueRequest,
  DeleteBindingRequest,
  DeleteQueueRequest,
  ExchangeInfo,
  HealthResult,
  NodeInfo,
  OperationResult,
  PolicyInfo,
  PublishMessageRequest,
  QueueInfo
} from '@shared/types'

/** The complete set of AMQP basic message properties RabbitMQ accepts on publish. */
const VALID_PROPERTIES = new Set([
  'content_type',
  'content_encoding',
  'priority',
  'delivery_mode',
  'correlation_id',
  'reply_to',
  'expiration',
  'message_id',
  'timestamp',
  'type',
  'user_id',
  'app_id',
  'cluster_id'
])

/**
 * Thin client over the RabbitMQ Management HTTP API (the `rabbitmq_management`
 * plugin, default port 15672). Used for everything that is a management-plane
 * concept rather than a message operation: listing queues, stats, purging.
 *
 * Message-level work (peek, move) goes over AMQP instead — see message-peeker
 * and operations.
 */
export class ManagementApi {
  private readonly baseUrl: string
  private readonly authHeader: string
  private readonly vhost: string

  constructor(config: ConnectionConfig) {
    const scheme = config.tls ? 'https' : 'http'
    this.baseUrl = `${scheme}://${config.host}:${config.managementPort}/api`
    this.authHeader =
      'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64')
    this.vhost = config.vhost
  }

  /** Encodes a vhost for use in a path segment ("/" -> "%2F"). */
  private vhostSegment(): string {
    return encodeURIComponent(this.vhost)
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const method = init?.method ?? 'GET'
    const url = `${this.baseUrl}${path}`

    let res: Response
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          authorization: this.authHeader,
          'content-type': 'application/json',
          ...init?.headers
        }
      })
    } catch (err) {
      // Network-level failure (host down, wrong port, DNS, TLS) — fetch rejects
      // before any HTTP status. Dig the OS error code out of the cause for a hint.
      throw new Error(describeNetworkError(err, method, url))
    }

    if (!res.ok) {
      throw new Error(await describeHttpError(res, method, path))
    }
    // Some endpoints (purge) return 204 with no body.
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  /** Cheap reachability + auth probe used on connect. */
  async ping(): Promise<void> {
    await this.request('/whoami')
  }

  /** Cluster-wide summary: version, object totals, message rates. */
  async getOverview(): Promise<ClusterOverview> {
    const o = await this.request<RawOverview>('/overview')
    return {
      rabbitmqVersion: o.rabbitmq_version ?? o.product_version ?? 'unknown',
      erlangVersion: o.erlang_version,
      clusterName: o.cluster_name ?? '',
      totals: {
        queues: o.object_totals?.queues ?? 0,
        connections: o.object_totals?.connections ?? 0,
        channels: o.object_totals?.channels ?? 0,
        consumers: o.object_totals?.consumers ?? 0,
        exchanges: o.object_totals?.exchanges ?? 0
      },
      rates: {
        publish: o.message_stats?.publish_details?.rate,
        deliver: o.message_stats?.deliver_get_details?.rate,
        ack: o.message_stats?.ack_details?.rate
      }
    }
  }

  /** Deep liveness probe for the configured vhost: the broker declares a temporary
   * queue, publishes and consumes a message, then deletes it. Unlike `/whoami`
   * (auth only) this proves the broker can actually move a message on the vhost.
   * Needs configure/write/read perms on the vhost (which any operating user has);
   * returns the broker's failure reason when it can't. */
  async checkAliveness(): Promise<HealthResult> {
    try {
      const res = await this.request<{ status?: string; reason?: string }>(
        `/aliveness-test/${this.vhostSegment()}`
      )
      if (res?.status === 'ok') return { ok: true }
      return { ok: false, error: res?.reason ?? 'Broker reported the vhost is not alive.' }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Live client connections to the broker (cluster-wide). */
  async listConnections(): Promise<ClientConnectionInfo[]> {
    const raw = await this.request<RawConnection[]>('/connections')
    return raw.map((c) => ({
      name: c.name,
      user: c.user ?? '',
      vhost: c.vhost ?? '',
      peer:
        c.peer_host != null
          ? c.peer_port != null
            ? `${c.peer_host}:${c.peer_port}`
            : c.peer_host
          : '',
      protocol: c.protocol ?? '',
      channels: c.channels ?? 0,
      state: c.state ?? 'unknown',
      tls: c.ssl ?? false,
      connectedAt: c.connected_at,
      clientName:
        (c.client_properties?.connection_name as string | undefined) ??
        (c.client_properties?.product as string | undefined)
    }))
  }

  /** Consumers subscribed on the configured vhost. */
  async listConsumers(): Promise<ConsumerInfo[]> {
    const raw = await this.request<RawConsumer[]>(`/consumers/${this.vhostSegment()}`)
    return raw.map((c) => ({
      queue: c.queue?.name ?? '',
      consumerTag: c.consumer_tag ?? '',
      connectionName: c.channel_details?.connection_name,
      ackRequired: c.ack_required ?? false,
      prefetchCount: c.prefetch_count ?? 0,
      active: c.active ?? true,
      exclusive: c.exclusive ?? false
    }))
  }

  /** Force-close a client connection. The reason is surfaced to the client. */
  async closeConnection(name: string, reason: string): Promise<OperationResult> {
    try {
      await this.request<void>(`/connections/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { 'X-Reason': reason }
      })
      return { ok: true, affected: 1 }
    } catch (err) {
      return { ok: false, affected: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Per-node health, including memory / disk alarms. */
  async getNodes(): Promise<NodeInfo[]> {
    const raw = await this.request<RawNode[]>('/nodes')
    return raw.map((n) => ({
      name: n.name,
      running: n.running ?? false,
      memUsed: n.mem_used,
      memLimit: n.mem_limit,
      memAlarm: n.mem_alarm ?? false,
      diskFree: n.disk_free,
      diskFreeLimit: n.disk_free_limit,
      diskFreeAlarm: n.disk_free_alarm ?? false,
      fdUsed: n.fd_used,
      fdTotal: n.fd_total,
      uptime: n.uptime
    }))
  }

  async listQueues(): Promise<QueueInfo[]> {
    const raw = await this.request<RawQueue[]>(`/queues/${this.vhostSegment()}`)
    return raw.map((q) => ({
      name: q.name,
      vhost: q.vhost,
      durable: q.durable,
      state: q.state ?? 'unknown',
      messages: q.messages ?? 0,
      messagesReady: q.messages_ready ?? 0,
      messagesUnacknowledged: q.messages_unacknowledged ?? 0,
      consumers: q.consumers ?? 0,
      // Richer signal (present on the standard /queues payload; absent on very old
      // brokers or queues with no recent activity — left undefined then).
      memory: q.memory,
      idleSince: q.idle_since,
      messageRate: q.messages_details?.rate,
      publishRate: q.message_stats?.publish_details?.rate,
      deliverRate: q.message_stats?.deliver_get_details?.rate,
      ackRate: q.message_stats?.ack_details?.rate
    }))
  }

  async purgeQueue(queue: string): Promise<OperationResult> {
    try {
      const before = await this.request<RawQueue>(
        `/queues/${this.vhostSegment()}/${encodeURIComponent(queue)}`
      )
      await this.request<void>(
        `/queues/${this.vhostSegment()}/${encodeURIComponent(queue)}/contents`,
        { method: 'DELETE' }
      )
      return { ok: true, affected: before.messages ?? 0 }
    } catch (err) {
      return { ok: false, affected: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Declare a queue. PUT is idempotent: re-asserting identical settings succeeds;
   * a name clash with different settings fails (precondition) and is surfaced. */
  async createQueue(req: CreateQueueRequest): Promise<OperationResult> {
    try {
      await this.request<void>(`/queues/${this.vhostSegment()}/${encodeURIComponent(req.name)}`, {
        method: 'PUT',
        body: JSON.stringify({
          durable: req.durable,
          auto_delete: req.autoDelete,
          arguments: req.arguments ?? {}
        })
      })
      return { ok: true, affected: 1 }
    } catch (err) {
      return { ok: false, affected: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Delete a whole queue. With if-empty / if-unused the broker rejects (and we
   * surface) the delete when the queue still has messages / consumers. */
  async deleteQueue(req: DeleteQueueRequest): Promise<OperationResult> {
    try {
      // Capture the message count first so we can report what was discarded.
      const before = await this.request<RawQueue>(
        `/queues/${this.vhostSegment()}/${encodeURIComponent(req.name)}`
      )
      const params = new URLSearchParams()
      if (req.ifEmpty) params.set('if-empty', 'true')
      if (req.ifUnused) params.set('if-unused', 'true')
      const query = params.toString()
      await this.request<void>(
        `/queues/${this.vhostSegment()}/${encodeURIComponent(req.name)}${query ? `?${query}` : ''}`,
        { method: 'DELETE' }
      )
      return { ok: true, affected: before.messages ?? 0 }
    } catch (err) {
      return { ok: false, affected: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Path segment for an exchange — the default ("") is addressed as amq.default. */
  private exchangeSegment(name: string): string {
    return encodeURIComponent(name === '' ? 'amq.default' : name)
  }

  async listExchanges(): Promise<ExchangeInfo[]> {
    const raw = await this.request<RawExchange[]>(`/exchanges/${this.vhostSegment()}`)
    return raw.map((x) => ({
      name: x.name,
      vhost: x.vhost,
      type: x.type,
      durable: x.durable,
      autoDelete: x.auto_delete ?? false,
      internal: x.internal ?? false
    }))
  }

  async listExchangeBindings(exchange: string): Promise<BindingInfo[]> {
    const raw = await this.request<RawBinding[]>(
      `/exchanges/${this.vhostSegment()}/${this.exchangeSegment(exchange)}/bindings/source`
    )
    return raw.map((b) => ({
      source: b.source,
      destination: b.destination,
      destinationType: b.destination_type === 'exchange' ? 'exchange' : 'queue',
      routingKey: b.routing_key,
      arguments: b.arguments ?? {},
      propertiesKey: b.properties_key
    }))
  }

  /** Declare an exchange. PUT is idempotent for identical settings; a clash with
   * different settings fails (precondition) and is surfaced. */
  async createExchange(req: CreateExchangeRequest): Promise<OperationResult> {
    try {
      await this.request<void>(
        `/exchanges/${this.vhostSegment()}/${this.exchangeSegment(req.name)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            type: req.type,
            durable: req.durable,
            auto_delete: req.autoDelete,
            internal: req.internal,
            arguments: req.arguments ?? {}
          })
        }
      )
      return { ok: true, affected: 1 }
    } catch (err) {
      return { ok: false, affected: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Path segment for a binding destination — `q` for queues, `e` for exchanges.
   * Exchange destinations go through exchangeSegment so the default exchange ("")
   * is addressed as amq.default, consistent with the other exchange endpoints. */
  private bindingDestSegment(type: 'queue' | 'exchange', destination: string): string {
    return type === 'exchange'
      ? `e/${this.exchangeSegment(destination)}`
      : `q/${encodeURIComponent(destination)}`
  }

  async createBinding(req: CreateBindingRequest): Promise<OperationResult> {
    try {
      await this.request<void>(
        `/bindings/${this.vhostSegment()}/e/${this.exchangeSegment(req.source)}/${this.bindingDestSegment(req.destinationType, req.destination)}`,
        {
          method: 'POST',
          body: JSON.stringify({ routing_key: req.routingKey, arguments: req.arguments ?? {} })
        }
      )
      return { ok: true, affected: 1 }
    } catch (err) {
      return { ok: false, affected: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteBinding(req: DeleteBindingRequest): Promise<OperationResult> {
    try {
      await this.request<void>(
        `/bindings/${this.vhostSegment()}/e/${this.exchangeSegment(req.source)}/${this.bindingDestSegment(req.destinationType, req.destination)}/${encodeURIComponent(req.propertiesKey)}`,
        { method: 'DELETE' }
      )
      return { ok: true, affected: 1 }
    } catch (err) {
      return { ok: false, affected: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteExchange(exchange: string): Promise<OperationResult> {
    try {
      await this.request<void>(
        `/exchanges/${this.vhostSegment()}/${this.exchangeSegment(exchange)}`,
        { method: 'DELETE' }
      )
      return { ok: true, affected: 1 }
    } catch (err) {
      return { ok: false, affected: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async listPolicies(): Promise<PolicyInfo[]> {
    const raw = await this.request<RawPolicy[]>(`/policies/${this.vhostSegment()}`)
    return raw.map((p) => ({
      name: p.name,
      vhost: p.vhost,
      pattern: p.pattern ?? '',
      applyTo: p['apply-to'] ?? 'all',
      definition: p.definition ?? {},
      priority: p.priority ?? 0
    }))
  }

  async createPolicy(req: CreatePolicyRequest): Promise<OperationResult> {
    try {
      await this.request<void>(`/policies/${this.vhostSegment()}/${encodeURIComponent(req.name)}`, {
        method: 'PUT',
        body: JSON.stringify({
          pattern: req.pattern,
          definition: req.definition,
          priority: req.priority,
          'apply-to': req.applyTo
        })
      })
      return { ok: true, affected: 1 }
    } catch (err) {
      return { ok: false, affected: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async deletePolicy(name: string): Promise<OperationResult> {
    try {
      await this.request<void>(`/policies/${this.vhostSegment()}/${encodeURIComponent(name)}`, {
        method: 'DELETE'
      })
      return { ok: true, affected: 1 }
    } catch (err) {
      return { ok: false, affected: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Export this vhost's topology (queues/exchanges/bindings/policies/parameters).
   * The vhost-scoped endpoint excludes users/permissions, so no credentials leak.
   * Requires the broker user's `administrator` tag. */
  async getDefinitions(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/definitions/${this.vhostSegment()}`)
  }

  /** Apply a definitions document to this vhost (creates/updates; never deletes).
   * Idempotent and additive; requires the `administrator` tag. */
  async importDefinitions(defs: unknown): Promise<OperationResult> {
    try {
      await this.request<void>(`/definitions/${this.vhostSegment()}`, {
        method: 'POST',
        body: JSON.stringify(defs)
      })
      return { ok: true, affected: 1 }
    } catch (err) {
      return { ok: false, affected: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async publishMessage(req: PublishMessageRequest): Promise<OperationResult> {
    try {
      // Invalid properties are ignored (only the known AMQP basic properties pass).
      const properties: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(req.properties)) {
        if (VALID_PROPERTIES.has(key)) properties[key] = value
      }
      if (Object.keys(req.headers).length > 0) properties.headers = req.headers
      const result = await this.request<{ routed: boolean }>(
        `/exchanges/${this.vhostSegment()}/${this.exchangeSegment(req.exchange)}/publish`,
        {
          method: 'POST',
          body: JSON.stringify({
            properties,
            routing_key: req.routingKey,
            payload: req.payload,
            payload_encoding: req.payloadEncoding
          })
        }
      )
      return { ok: true, affected: result.routed ? 1 : 0 }
    } catch (err) {
      return { ok: false, affected: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }
}

/** Human hint for a Node/undici socket error code. */
function hintForCode(code: string): string {
  switch (code) {
    case 'ECONNREFUSED':
      return ' — nothing is listening there. Check the host and management port (default 15672) and that the rabbitmq_management plugin is enabled.'
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return ' — host could not be resolved. Check the hostname.'
    case 'ETIMEDOUT':
    case 'UND_ERR_CONNECT_TIMEOUT':
      return ' — connection timed out. Check the host/port and any firewall between you and the broker.'
    case 'ECONNRESET':
      return ' — the connection was reset. If the broker uses TLS, enable the TLS option (https).'
    case 'CERT_HAS_EXPIRED':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      return ' — the TLS certificate could not be verified.'
    default:
      return ''
  }
}

/** Build a detailed message for a fetch() that rejected before any HTTP response. */
function describeNetworkError(err: unknown, method: string, url: string): string {
  const cause =
    err && typeof err === 'object' && 'cause' in err
      ? (err as { cause?: unknown }).cause
      : undefined
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? String((cause as { code?: unknown }).code)
      : undefined
  const causeMsg =
    cause instanceof Error ? cause.message : err instanceof Error ? err.message : String(err)
  // `code` already conveys the failure for the common cases (ECONNREFUSED has an
  // empty message); only append causeMsg when it adds something.
  const detail = [code, causeMsg].filter(Boolean).join(': ') || 'connection failed'
  return `Cannot reach the RabbitMQ management API (${method} ${url}): ${detail}${code ? hintForCode(code) : ''}`
}

/** Build a detailed message for a non-2xx HTTP response, including the broker's reason. */
async function describeHttpError(res: Response, method: string, path: string): Promise<string> {
  let reason = ''
  try {
    const text = await res.text()
    if (text) {
      try {
        const json = JSON.parse(text) as { error?: unknown; reason?: unknown }
        const parts = [json.error, json.reason].filter(Boolean).map(String)
        reason = parts.join(': ') || text
      } catch {
        reason = text
      }
    }
  } catch {
    // ignore body read failures
  }
  const hint =
    res.status === 401
      ? ' — check the username and password.'
      : res.status === 403
        ? ' — the user lacks permission for this virtual host or resource.'
        : res.status === 404
          ? ' — not found; check the virtual host and resource name.'
          : ''
  const base = `Management API ${method} ${path} failed: ${res.status} ${res.statusText}${hint}`
  return reason ? `${base} (${reason.trim()})` : base
}

interface RawRate {
  rate?: number
}

interface RawOverview {
  rabbitmq_version?: string
  product_version?: string
  erlang_version?: string
  cluster_name?: string
  object_totals?: {
    queues?: number
    connections?: number
    channels?: number
    consumers?: number
    exchanges?: number
  }
  message_stats?: {
    publish_details?: RawRate
    deliver_get_details?: RawRate
    ack_details?: RawRate
  }
}

interface RawNode {
  name: string
  running?: boolean
  mem_used?: number
  mem_limit?: number
  mem_alarm?: boolean
  disk_free?: number
  disk_free_limit?: number
  disk_free_alarm?: boolean
  fd_used?: number
  fd_total?: number
  uptime?: number
}

interface RawQueue {
  name: string
  vhost: string
  durable: boolean
  state?: string
  messages?: number
  messages_ready?: number
  messages_unacknowledged?: number
  consumers?: number
  memory?: number
  idle_since?: string
  messages_details?: RawRate
  message_stats?: {
    publish_details?: RawRate
    deliver_get_details?: RawRate
    ack_details?: RawRate
  }
}

interface RawExchange {
  name: string
  vhost: string
  type: string
  durable: boolean
  auto_delete?: boolean
  internal?: boolean
}

interface RawBinding {
  source: string
  destination: string
  destination_type?: string
  routing_key: string
  arguments?: Record<string, unknown>
  properties_key?: string
}

interface RawConnection {
  name: string
  user?: string
  vhost?: string
  peer_host?: string
  peer_port?: number
  protocol?: string
  channels?: number
  state?: string
  ssl?: boolean
  connected_at?: number
  client_properties?: Record<string, unknown>
}

interface RawPolicy {
  name: string
  vhost: string
  pattern?: string
  'apply-to'?: string
  definition?: Record<string, unknown>
  priority?: number
}

interface RawConsumer {
  queue?: { name?: string; vhost?: string }
  consumer_tag?: string
  channel_details?: { connection_name?: string; number?: number }
  ack_required?: boolean
  prefetch_count?: number
  active?: boolean
  exclusive?: boolean
}
