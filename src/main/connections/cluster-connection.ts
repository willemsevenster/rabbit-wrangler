import { eventBus } from '../event-bus'
import { ManagementApi } from '../rabbitmq/management-api'
import { MessagePeeker } from '../rabbitmq/message-peeker'
import { deleteMessage, moveMessage, moveMessages } from '../rabbitmq/operations'
import { connectAmqp, type AmqpConnection } from '../rabbitmq/amqp'
import type {
  BindingInfo,
  ConnectionConfig,
  ConnectionState,
  DeleteMessageRequest,
  ExchangeInfo,
  MoveMessageRequest,
  MoveMessagesRequest,
  OperationResult,
  PublishMessageRequest,
  QueueInfo
} from '@shared/types'

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
  private readonly peekers = new Map<string, MessagePeeker>()
  private statsTimer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly config: ConnectionConfig) {
    this.api = new ManagementApi(config)
  }

  get id(): string {
    return this.config.id
  }

  get currentState(): ConnectionState {
    return this.state
  }

  private setState(state: ConnectionState, error?: string): void {
    this.state = state
    eventBus.emitStream({
      type: 'connection-status',
      payload: { connectionId: this.config.id, state, error }
    })
  }

  /** Verify the management endpoint is reachable; AMQP stays lazy. */
  async connect(): Promise<void> {
    this.setState('connecting')
    try {
      await this.api.ping()
      this.setState('connected')
      this.startStatsPolling()
    } catch (err) {
      this.setState('error', err instanceof Error ? err.message : String(err))
      throw err
    }
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

  async listQueues(): Promise<QueueInfo[]> {
    return this.api.listQueues()
  }

  async listExchanges(): Promise<ExchangeInfo[]> {
    return this.api.listExchanges()
  }

  async listExchangeBindings(exchange: string): Promise<BindingInfo[]> {
    return this.api.listExchangeBindings(exchange)
  }

  async deleteExchange(exchange: string): Promise<OperationResult> {
    return this.api.deleteExchange(exchange)
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

  async startPeek(queue: string): Promise<void> {
    if (this.peekers.has(queue)) return
    const peeker = new MessagePeeker(this.config.id, queue, await this.amqpConnection())
    this.peekers.set(queue, peeker)
    await peeker.start()
  }

  async stopPeek(queue: string): Promise<void> {
    const peeker = this.peekers.get(queue)
    if (!peeker) return
    await peeker.stop()
    this.peekers.delete(queue)
  }

  async moveMessages(req: MoveMessagesRequest): Promise<OperationResult> {
    // Like purge: a running peeker holds the source queue's messages unacked, so
    // the move's get-loop wouldn't see them. Release it first.
    await this.stopPeek(req.sourceQueue)
    return moveMessages(await this.amqpConnection(), req)
  }

  async moveMessage(req: MoveMessageRequest): Promise<OperationResult> {
    // Release the peeker so the scan can pull the target (held unacked otherwise).
    await this.stopPeek(req.sourceQueue)
    return moveMessage(await this.amqpConnection(), req)
  }

  async deleteMessage(req: DeleteMessageRequest): Promise<OperationResult> {
    await this.stopPeek(req.sourceQueue)
    return deleteMessage(await this.amqpConnection(), req)
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
