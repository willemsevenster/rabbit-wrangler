import type { StreamEvent } from '@shared/ipc'

/**
 * Renderer-side client for the main process event WebSocket.
 *
 * It asks the preload bridge for the port (assigned at startup), connects to
 * `ws://127.0.0.1:<port>`, and invokes the handler for every decoded
 * {@link StreamEvent}. Auto-reconnects with a fixed backoff so a transient drop
 * (e.g. main reloads in dev) heals without a page refresh.
 */
export class EventSocket {
  private ws: WebSocket | null = null
  private closed = false
  private readonly reconnectMs = 1000

  constructor(private readonly onEvent: (event: StreamEvent) => void) {}

  async connect(): Promise<void> {
    this.closed = false
    const port = await window.api.getEventStreamPort()
    this.open(port)
  }

  private open(port: number): void {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    this.ws = ws
    ws.onmessage = (e) => {
      try {
        this.onEvent(JSON.parse(e.data as string) as StreamEvent)
      } catch {
        // ignore malformed frames
      }
    }
    ws.onclose = () => {
      if (!this.closed) setTimeout(() => this.open(port), this.reconnectMs)
    }
  }

  close(): void {
    this.closed = true
    this.ws?.close()
    this.ws = null
  }
}
