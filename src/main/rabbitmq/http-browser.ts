import { eventBus } from '../event-bus'
import { fingerprintOf } from './fingerprint'
import type { ManagementApi, RawGetMessage } from './management-api'
import type { PeekedMessage } from '@shared/types'

/**
 * Read-only, de-duplicated browsing over the management HTTP API — the fallback
 * for when the AMQP port (5672) is firewalled but the management port is open.
 *
 * It polls `POST /queues/{vhost}/{name}/get` with `ackmode=reject_requeue_true`,
 * which returns the head messages and immediately requeues them (non-destructive),
 * and emits each newly-seen message as a `peek` StreamEvent — the SAME event the
 * AMQP {@link MessagePeeker} emits, so the renderer's peek UI is identical.
 *
 * Differences from the AMQP peeker (by design):
 *   - Polled, not push: new messages appear on the poll interval, not instantly.
 *   - Read-only: there is no HTTP primitive to move/delete a single message, so
 *     those actions are disabled in HTTP mode (the renderer + ClusterConnection
 *     both gate them).
 *   - Same head-window + fingerprint de-dup caveats as the AMQP peeker.
 */

/** How many head messages to request per poll — the visible "head window". */
const BROWSE_WINDOW = 20
/** How often to re-poll the queue head over HTTP. */
const POLL_INTERVAL_MS = 2500
/** Bound on remembered fingerprints so a long browse can't grow unbounded. */
const MAX_FINGERPRINTS = 10_000

export class HttpBrowser {
  private timer: ReturnType<typeof setInterval> | null = null
  private inFlight = false
  private counter = 0
  /** Fingerprints already surfaced to the UI (insertion-ordered for eviction). */
  private readonly seen = new Set<string>()

  constructor(
    private readonly connectionId: string,
    private readonly queue: string,
    private readonly api: ManagementApi
  ) {}

  async start(): Promise<void> {
    if (this.timer) return
    await this.poll() // surface the current head immediately
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
  }

  private async poll(): Promise<void> {
    // Skip if the previous poll is still running (slow broker/network).
    if (this.inFlight) return
    this.inFlight = true
    try {
      const messages = await this.api.browseMessages(this.queue, BROWSE_WINDOW)
      for (const raw of messages) {
        const fingerprint = fingerprintFor(raw)
        if (this.seen.has(fingerprint)) continue
        this.remember(fingerprint)
        this.emit(raw, fingerprint)
      }
    } catch {
      // Transient management-API hiccup; connection-status reports real failures.
    } finally {
      this.inFlight = false
    }
  }

  private emit(raw: RawGetMessage, fingerprint: string): void {
    const isBinary = raw.payload_encoding === 'base64'
    const { headers, ...properties } = (raw.properties ?? {}) as Record<string, unknown>
    const peeked: PeekedMessage = {
      id: `${this.connectionId}:${this.queue}:http:${this.counter++}`,
      fingerprint,
      connectionId: this.connectionId,
      queue: this.queue,
      exchange: raw.exchange,
      routingKey: raw.routing_key,
      redelivered: raw.redelivered,
      // The management API already returns base64 for binary and UTF-8 strings
      // otherwise — matching PeekedMessage's contract exactly.
      payload: raw.payload,
      isBinary,
      properties,
      headers: (headers as Record<string, unknown>) ?? {},
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
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.seen.clear()
  }
}

/** Fingerprint an HTTP-get message using the SAME logic as the AMQP peeker, so a
 * browse buffer de-dups identically. (Move/delete are disabled in HTTP mode, so
 * this only needs to be internally consistent.) The management API may use either
 * `message_id`/`messageId` casing depending on version — accept both. */
function fingerprintFor(raw: RawGetMessage): string {
  const props = (raw.properties ?? {}) as Record<string, unknown>
  const content = Buffer.from(raw.payload, raw.payload_encoding === 'base64' ? 'base64' : 'utf8')
  return fingerprintOf({
    fields: { routingKey: raw.routing_key },
    properties: {
      messageId: props.message_id ?? props.messageId,
      correlationId: props.correlation_id ?? props.correlationId
    },
    content
  })
}
