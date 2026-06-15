import { eventBus } from '../event-bus'
import { ManagementApi } from '../rabbitmq/management-api'
import { MessagePeeker } from '../rabbitmq/message-peeker'
import { moveMessages } from '../rabbitmq/operations'
import { connectAmqp, type AmqpConnection } from '../rabbitmq/amqp'
import type {
  BindingInfo,
  ConnectionConfig,
  ConnectionState,
  ExchangeInfo,
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
export class ClusterConnection {
  readonly api: ManagementApi
  private amqp: AmqpConnection | null = null
  private state: ConnectionState = 'disconnected'
  private readonly peekers = new Map<string, MessagePeeker>()

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
    } catch (err) {
      this.setState('error', err instanceof Error ? err.message : String(err))
      throw err
    }
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

  async dispose(): Promise<void> {
    await Promise.all([...this.peekers.values()].map((p) => p.stop()))
    this.peekers.clear()
    if (this.amqp) {
      await this.amqp.close().catch(() => undefined)
      this.amqp = null
    }
    this.setState('disconnected')
  }
}
