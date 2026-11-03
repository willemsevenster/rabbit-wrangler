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
  /** The pending flush's paired frame + timer; whichever fires first cancels the other. */
  private pendingFrame: number | null = null
  private pendingTimer: ReturnType<typeof setTimeout> | null = null

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
    if (this.pendingTimer !== null) return
    // rAF pauses in a hidden window; the timer is the fallback so events still
    // drain. Cancelling the loser keeps hidden-window frames from piling up.
    this.pendingFrame = requestAnimationFrame(() => this.flush())
    this.pendingTimer = setTimeout(() => this.flush(), 100)
  }

  private flush(): void {
    if (this.pendingFrame !== null) cancelAnimationFrame(this.pendingFrame)
    if (this.pendingTimer !== null) clearTimeout(this.pendingTimer)
    this.pendingFrame = null
    this.pendingTimer = null
    const batch = this.queue
    this.queue = []
    if (batch.length > 0) this.onEvents(batch)
  }

  close(): void {
    this.closed = true
    this.ws?.close()
    this.ws = null
  }
}
