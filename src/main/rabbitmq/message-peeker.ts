import type { ConsumeMessage } from 'amqplib'
import { eventBus } from '../event-bus'
import { fingerprintOf } from './fingerprint'
import type { AmqpChannel, AmqpConnection } from './amqp'
import type { PeekedMessage } from '@shared/types'

/**
 * Live, non-destructive, de-duplicated peeking.
 *
 * We consume the queue with manual ack and immediately `nack(requeue: true)`, so
 * nothing is ever consumed. But with no other consumer draining the queue, the
 * broker redelivers the same messages forever — so a naive feed shows the same
 * few messages hundreds of times. To make the feed interpretable we:
 *
 *   1. Surface each message exactly ONCE, keyed by a fingerprint (the
 *      publisher's `messageId` if set, else a hash of body + routing key +
 *      correlationId). New messages flowing through the queue still appear live.
 *   2. Requeue already-seen messages on a throttle, so a static queue settles
 *      into a slow loop instead of pegging the CPU and broker.
 *
 * Caveats (by design — see the "deduplicated live tail" choice):
 *   - Only the head `PREFETCH_WINDOW` messages are ever in view.
 *   - Two payload-identical messages with no `messageId` collapse into one row.
 *   - The in-flight window is briefly held unacked while peeking.
 */

/** How many messages are held in-flight — the visible "head window". */
const PREFETCH_WINDOW = 20
/** Requeue delay for a freshly-seen message — keep the feed responsive. */
const NEW_REQUEUE_DELAY_MS = 30
/** Requeue delay for an already-seen message — throttle the redelivery loop. */
const SEEN_REQUEUE_DELAY_MS = 400
/** Bound on remembered fingerprints so a long peek can't grow unbounded. */
const MAX_FINGERPRINTS = 10_000

export class MessagePeeker {
  private channel: AmqpChannel | null = null
  private consumerTag: string | null = null
  private counter = 0
  /** Fingerprints already surfaced to the UI (insertion-ordered for eviction). */
  private readonly seen = new Set<string>()
  private readonly pending = new Set<ReturnType<typeof setTimeout>>()

  constructor(
    private readonly connectionId: string,
    private readonly queue: string,
    private readonly conn: AmqpConnection
  ) {}

  async start(): Promise<void> {
    if (this.channel) return
    const channel = await this.conn.createChannel()
    await channel.prefetch(PREFETCH_WINDOW)
    this.channel = channel

    const { consumerTag } = await channel.consume(
      this.queue,
      (msg) => this.handle(msg),
      { noAck: false }
    )
    this.consumerTag = consumerTag
  }

  private handle(msg: ConsumeMessage | null): void {
    if (!msg || !this.channel) return

    const fingerprint = fingerprintOf(msg)
    const isNew = !this.seen.has(fingerprint)
    if (isNew) {
      this.remember(fingerprint)
      this.emit(msg, fingerprint)
    }

    // Put it back (non-destructive). Already-seen messages are requeued slowly so
    // the redelivery loop on a static queue stays gentle.
    const timer = setTimeout(
      () => {
        this.pending.delete(timer)
        try {
          this.channel?.nack(msg, false, true)
        } catch {
          // channel already closed; ignore
        }
      },
      isNew ? NEW_REQUEUE_DELAY_MS : SEEN_REQUEUE_DELAY_MS
    )
    this.pending.add(timer)
  }

  private emit(msg: ConsumeMessage, fingerprint: string): void {
    const isBinary = !isUtf8(msg.content)
    const peeked: PeekedMessage = {
      id: `${this.connectionId}:${this.queue}:${msg.fields.deliveryTag}:${this.counter++}`,
      fingerprint,
      connectionId: this.connectionId,
      queue: this.queue,
      exchange: msg.fields.exchange,
      routingKey: msg.fields.routingKey,
      redelivered: msg.fields.redelivered,
      payload: isBinary ? msg.content.toString('base64') : msg.content.toString('utf8'),
      isBinary,
      properties: extractProperties(msg),
      headers: (msg.properties.headers as Record<string, unknown>) ?? {},
      observedAt: Date.now()
    }
    eventBus.emitStream({ type: 'peek', payload: peeked })
  }

  private remember(fingerprint: string): void {
    this.seen.add(fingerprint)
    if (this.seen.size > MAX_FINGERPRINTS) {
      const oldest = this.seen.values().next().value
      if (oldest !== undefined) this.seen.delete(oldest)
    }
  }

  async stop(): Promise<void> {
    for (const timer of this.pending) clearTimeout(timer)
    this.pending.clear()
    if (this.channel && this.consumerTag) {
      try {
        await this.channel.cancel(this.consumerTag)
        await this.channel.close()
      } catch {
        // channel may already be gone; ignore
      }
    }
    this.channel = null
    this.consumerTag = null
    this.seen.clear()
  }
}

function extractProperties(msg: ConsumeMessage): Record<string, unknown> {
  const { headers: _headers, ...rest } = msg.properties
  return rest as Record<string, unknown>
}

/** Best-effort check that a buffer is valid UTF-8 (so we don't mangle binaries). */
function isUtf8(buf: Buffer): boolean {
  return Buffer.compare(Buffer.from(buf.toString('utf8'), 'utf8'), buf) === 0
}
