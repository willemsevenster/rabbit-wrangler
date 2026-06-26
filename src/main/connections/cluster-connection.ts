import { eventBus } from '../event-bus'
import { ManagementApi } from '../rabbitmq/management-api'
import { MessagePeeker } from '../rabbitmq/message-peeker'
import { HttpBrowser } from '../rabbitmq/http-browser'
import { deleteMessage, exportMessages, moveMessage, moveMessages } from '../rabbitmq/operations'
import { connectAmqp, probeAmqpReachable, type AmqpConnection } from '../rabbitmq/amqp'
import type {
  BindingInfo,
  BrowseMode,
  ClientConnectionInfo,
  ClusterOverview,
  ConnectionConfig,
  ConnectionRuntime,
  ConnectionState,
  ConsumerInfo,
  CreateBindingRequest,
  CreateExchangeRequest,
  CreatePolicyRequest,
  CreateQueueRequest,
  DeleteBindingRequest,
  DeleteMessageRequest,
  DeleteQueueRequest,
  ExchangeInfo,
  ExportedMessage,
  ExportMessagesRequest,
  HealthResult,
  MessageTransport,
  MoveMessageRequest,
  MoveMessagesRequest,
  NodeInfo,
  OperationResult,
  PolicyInfo,
  PublishMessageRequest,
  QueueInfo
} from '@shared/types'

/** One queue browser — either the live AMQP peeker or the polled HTTP browser.
 * Both surface `peek` events; only `stop()` is needed by ClusterConnection. */
type QueueBrowser = MessagePeeker | HttpBrowser

/** Surfaced when an AMQP-only message operation is attempted in HTTP browse mode. */
const HTTP_ONLY_ERROR =
  'This action needs the AMQP port, which is unavailable in HTTP browse mode.'

/**
 * One live connection to a single RabbitMQ cluster. Owns both transports for
 * that cluster: the management HTTP client (always available) and a lazily
 * opened AMQP connection (only needed for peek/move). Tracks and broadcasts its
 * own connection state.
 */
/** How often connected clusters re-poll queue stats and push them to the UI. */
const STATS_POLL_INTERVAL_MS = 4000

export class ClusterConnection {
  readonly api: ManagementApi
  private amqp: AmqpConnection | null = null
  private state: ConnectionState = 'disconnected'
  private readonly peekers = new Map<string, QueueBrowser>()
  private statsTimer: ReturnType<typeof setInterval> | null = null
  /** User preference for how to browse messages (persisted on the config). */
  private browseMode: BrowseMode
  /** Whether the AMQP port answered a TCP probe on connect. */
  private amqpReachable = false
  /** Effective transport, resolved from browseMode + amqpReachable on connect. */
  private transport: MessageTransport = 'amqp'

  constructor(private readonly config: ConnectionConfig) {
    this.api = new ManagementApi(config)
    this.browseMode = config.browseMode ?? 'auto'
  }

  get id(): string {
    return this.config.id
  }

  get currentState(): ConnectionState {
    return this.state
  }

  /** AMQP availability + effective transport (for the renderer's UI gating). */
  runtime(): ConnectionRuntime {
    return { amqpAvailable: this.amqpReachable, transport: this.transport }
  }

  private setState(state: ConnectionState, error?: string): void {
    this.state = state
    eventBus.emitStream({
      type: 'connection-status',
      payload: {
        connectionId: this.config.id,
        state,
        error,
        amqpAvailable: this.amqpReachable,
        transport: this.transport
      }
    })
  }

  /** Compute the effective transport from the current preference + AMQP reachability. */
  private resolveTransport(): MessageTransport {
    return this.browseMode === 'http' || !this.amqpReachable ? 'http' : 'amqp'
  }

  /** Verify the management endpoint is reachable, then probe the AMQP port so we
   * know whether to use AMQP or the HTTP browse fallback. AMQP stays lazy. */
  async connect(): Promise<void> {
    this.setState('connecting')
    try {
      await this.api.ping()
      // Detect whether AMQP is reachable; if it's firewalled, force HTTP browse.
      this.amqpReachable = await probeAmqpReachable(this.config)
      this.transport = this.resolveTransport()
      this.setState('connected')
      this.startStatsPolling()
    } catch (err) {
      this.setState('error', err instanceof Error ? err.message : String(err))
      throw err
    }
  }

  /** Switch the browse-mode preference at runtime (no reconnect): recompute the
   * effective transport and, if it changed, restart any active queue browsers in
   * the new transport. Re-broadcasts the connection status so the UI re-gates. */
  async applyBrowseMode(mode: BrowseMode): Promise<ConnectionRuntime> {
    this.browseMode = mode
    const next = this.resolveTransport()
    if (next !== this.transport) {
      const active = [...this.peekers.keys()]
      await Promise.all([...this.peekers.values()].map((p) => p.stop()))
      this.peekers.clear()
      this.transport = next
      for (const queue of active) await this.startPeek(queue)
    }
    // Re-broadcast the (possibly) new transport without changing the actual
    // connection state — never force it to 'connected'.
    this.setState(this.state)
    return this.runtime()
  }

  /** Periodically push fresh queue stats for THIS cluster to the renderer, so the
   * tree/overview/queue-tab update without a manual refresh — for every connected
   * cluster, not just the selected one. Scoped to the connection's lifetime. */
  private startStatsPolling(): void {
    if (this.statsTimer) return
    let inFlight = false
    const poll = async (): Promise<void> => {
      // Skip if the previous poll is still running (slow broker/network), so polls
      // never pile up or emit out of order.
      if (inFlight) return
      inFlight = true
      try {
        const queues = await this.listQueues()
        eventBus.emitStream({
          type: 'queue-stats',
          payload: { connectionId: this.config.id, queues }
        })
        // Cluster summary + node health (incl. resource alarms) on the same cadence.
        // /nodes needs the monitoring tag — fetch it best-effort so a permission-
        // limited user still gets the overview (nodes degrade to empty).
        const overview = await this.getOverview()
        const nodes = await this.getNodes().catch(() => [])
        eventBus.emitStream({
          type: 'cluster-stats',
          payload: { connectionId: this.config.id, overview, nodes }
        })
      } catch {
        // Transient management-API hiccup; connection-status reports real failures.
      } finally {
        inFlight = false
      }
    }
    void poll() // push once immediately so the UI updates without waiting an interval
    this.statsTimer = setInterval(() => void poll(), STATS_POLL_INTERVAL_MS)
  }

  /** Opens (or reuses) the AMQP connection used for message operations. */
  private async amqpConnection(): Promise<AmqpConnection> {
    if (this.amqp) return this.amqp
    const conn = await connectAmqp(this.config)
    conn.on('close', () => {
      this.amqp = null
    })
    conn.on('error', (err: Error) => this.setState('error', err.message))
    this.amqp = conn
    return conn
  }

  async getOverview(): Promise<ClusterOverview> {
    return this.api.getOverview()
  }

  async getNodes(): Promise<NodeInfo[]> {
    return this.api.getNodes()
  }

  async listPolicies(): Promise<PolicyInfo[]> {
    return this.api.listPolicies()
  }

  async createPolicy(req: CreatePolicyRequest): Promise<OperationResult> {
    return this.api.createPolicy(req)
  }

  async deletePolicy(name: string): Promise<OperationResult> {
    return this.api.deletePolicy(name)
  }

  async getDefinitions(): Promise<Record<string, unknown>> {
    return this.api.getDefinitions()
  }

  async importDefinitions(defs: unknown): Promise<OperationResult> {
    return this.api.importDefinitions(defs)
  }

  async checkHealth(): Promise<HealthResult> {
    return this.api.checkAliveness()
  }

  async listClientConnections(): Promise<ClientConnectionInfo[]> {
    return this.api.listConnections()
  }

  async listConsumers(): Promise<ConsumerInfo[]> {
    return this.api.listConsumers()
  }

  async closeClientConnection(name: string, reason: string): Promise<OperationResult> {
    return this.api.closeConnection(name, reason)
  }

  async listQueues(): Promise<QueueInfo[]> {
    return this.api.listQueues()
  }

  async listExchanges(): Promise<ExchangeInfo[]> {
    return this.api.listExchanges()
  }

  async listExchangeBindings(exchange: string): Promise<BindingInfo[]> {
    return this.api.listExchangeBindings(exchange)
  }

  async createExchange(req: CreateExchangeRequest): Promise<OperationResult> {
    return this.api.createExchange(req)
  }

  async deleteExchange(exchange: string): Promise<OperationResult> {
    return this.api.deleteExchange(exchange)
  }

  async createBinding(req: CreateBindingRequest): Promise<OperationResult> {
    return this.api.createBinding(req)
  }

  async deleteBinding(req: DeleteBindingRequest): Promise<OperationResult> {
    return this.api.deleteBinding(req)
  }

  async publishMessage(req: PublishMessageRequest): Promise<OperationResult> {
    return this.api.publishMessage(req)
  }

  async purgeQueue(queue: string): Promise<OperationResult> {
    // A running peeker holds this queue's messages unacked (they show as
    // in-flight, not ready), and purge only removes ready messages. Stop the
    // peeker first so closing its channel requeues them to ready, then purge.
    await this.stopPeek(queue)
    return this.api.purgeQueue(queue)
  }

  async createQueue(req: CreateQueueRequest): Promise<OperationResult> {
    return this.api.createQueue(req)
  }

  async deleteQueue(req: DeleteQueueRequest): Promise<OperationResult> {
    // Release our own peeker first: it holds a consumer, which would trip an
    // if-unused guard, and the queue is about to vanish anyway.
    await this.stopPeek(req.name)
    return this.api.deleteQueue(req)
  }

  async startPeek(queue: string): Promise<void> {
    if (this.peekers.has(queue)) return
    // HTTP mode polls the management API; AMQP mode opens a live nack/requeue consumer.
    const browser: QueueBrowser =
      this.transport === 'http'
        ? new HttpBrowser(this.config.id, queue, this.api)
        : new MessagePeeker(this.config.id, queue, await this.amqpConnection())
    this.peekers.set(queue, browser)
    await browser.start()
  }

  async stopPeek(queue: string): Promise<void> {
    const peeker = this.peekers.get(queue)
    if (!peeker) return
    await peeker.stop()
    this.peekers.delete(queue)
  }

  async moveMessages(req: MoveMessagesRequest): Promise<OperationResult> {
    if (this.transport === 'http') return { ok: false, affected: 0, error: HTTP_ONLY_ERROR }
    // Like purge: a running peeker holds the source queue's messages unacked, so
    // the move's get-loop wouldn't see them. Release it first.
    await this.stopPeek(req.sourceQueue)
    return moveMessages(await this.amqpConnection(), req)
  }

  async moveMessage(req: MoveMessageRequest): Promise<OperationResult> {
    if (this.transport === 'http') return { ok: false, affected: 0, error: HTTP_ONLY_ERROR }
    // Release the peeker so the scan can pull the target (held unacked otherwise).
    await this.stopPeek(req.sourceQueue)
    return moveMessage(await this.amqpConnection(), req)
  }

  async deleteMessage(req: DeleteMessageRequest): Promise<OperationResult> {
    if (this.transport === 'http') return { ok: false, affected: 0, error: HTTP_ONLY_ERROR }
    await this.stopPeek(req.sourceQueue)
    return deleteMessage(await this.amqpConnection(), req)
  }

  async exportMessages(req: ExportMessagesRequest): Promise<ExportedMessage[]> {
    // The drain-to-file path is AMQP-only; the UI also hides it in HTTP mode.
    if (this.transport === 'http') throw new Error(HTTP_ONLY_ERROR)
    // Release the peeker so its held messages are ready to be read (like move).
    await this.stopPeek(req.queue)
    return exportMessages(await this.amqpConnection(), req)
  }

  async dispose(): Promise<void> {
    if (this.statsTimer) {
      clearInterval(this.statsTimer)
      this.statsTimer = null
    }
    await Promise.all([...this.peekers.values()].map((p) => p.stop()))
    this.peekers.clear()
    if (this.amqp) {
      await this.amqp.close().catch(() => undefined)
      this.amqp = null
    }
    this.setState('disconnected')
  }
}
