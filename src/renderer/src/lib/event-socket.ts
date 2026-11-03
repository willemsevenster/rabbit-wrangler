import type { EventStreamEndpoint, StreamEvent } from '@shared/ipc'

/** Must match `TOKEN_PROTOCOL_PREFIX` in the main process' websocket-server. */
const TOKEN_PROTOCOL_PREFIX = 'rw-token.'

/**
 * Renderer-side client for the main process event WebSocket.
 *
 * It asks the preload bridge for the endpoint (port + per-launch token),
 * connects to `ws://127.0.0.1:<port>` presenting the token as a subprotocol, and
 * hands decoded {@link StreamEvent}s to the handler. Frames are delivered in
 * **batches, once per animation frame**, so a burst of peeks costs one store
 * update instead of one per message. Auto-reconnects with a fixed backoff so a
 * transient drop (e.g. main reloads in dev) heals without a page refresh.
 */
export class EventSocket {
  private ws: WebSocket | null = null
  private closed = false
  private readonly reconnectMs = 1000
  private queue: StreamEvent[] = []
  private flushScheduled = false

  constructor(private readonly onEvents: (events: StreamEvent[]) => void) {}

  async connect(): Promise<void> {
    this.closed = false
    this.open(await window.api.getEventStreamEndpoint())
  }

  private open(endpoint: EventStreamEndpoint): void {
    const ws = new WebSocket(`ws://127.0.0.1:${endpoint.port}`, [
      TOKEN_PROTOCOL_PREFIX + endpoint.token
    ])
    this.ws = ws
    ws.onmessage = (e) => {
      try {
        this.enqueue(JSON.parse(e.data as string) as StreamEvent)
      } catch {
        // ignore malformed frames
      }
    }
    ws.onclose = () => {
      if (!this.closed) setTimeout(() => this.open(endpoint), this.reconnectMs)
    }
  }

  private enqueue(event: StreamEvent): void {
    this.queue.push(event)
    if (this.flushScheduled) return
    this.flushScheduled = true
    // rAF pauses in a hidden window; fall back to a timer so events still drain.
    const flush = (): void => {
      if (!this.flushScheduled) return
      this.flushScheduled = false
      const batch = this.queue
      this.queue = []
      this.onEvents(batch)
    }
    requestAnimationFrame(flush)
    setTimeout(flush, 100)
  }

  close(): void {
    this.closed = true
    this.ws?.close()
    this.ws = null
  }
}
