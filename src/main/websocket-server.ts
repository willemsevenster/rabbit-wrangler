import { WebSocketServer, type WebSocket } from 'ws'
import { eventBus } from './event-bus'
import type { StreamEvent } from '@shared/ipc'

/**
 * Localhost WebSocket that pushes the live event stream to the renderer.
 *
 * Why a WebSocket rather than IPC `webContents.send`? Peeked messages can arrive
 * at high frequency; a dedicated socket keeps that firehose off the IPC channel
 * (which stays request/response only) and lets the renderer use one uniform
 * subscribe/backpressure model. We bind to 127.0.0.1 on an ephemeral port and
 * hand the port to the renderer via the `events:port` IPC call.
 */
class EventStreamServer {
  private wss: WebSocketServer | null = null
  private port = 0
  private unsubscribe: (() => void) | null = null

  start(): Promise<number> {
    if (this.wss) return Promise.resolve(this.port)
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
      wss.on('listening', () => {
        const address = wss.address()
        this.port = typeof address === 'object' && address ? address.port : 0
        this.wss = wss
        this.unsubscribe = eventBus.onStream((event) => this.broadcast(event))
        resolve(this.port)
      })
      wss.on('error', reject)
    })
  }

  private broadcast(event: StreamEvent): void {
    if (!this.wss) return
    const data = JSON.stringify(event)
    for (const client of this.wss.clients) {
      if (client.readyState === client.OPEN) {
        ;(client as WebSocket).send(data)
      }
    }
  }

  getPort(): number {
    return this.port
  }

  async stop(): Promise<void> {
    this.unsubscribe?.()
    this.unsubscribe = null
    await new Promise<void>((resolve) => {
      if (!this.wss) return resolve()
      this.wss.close(() => resolve())
    })
    this.wss = null
  }
}

export const eventStreamServer = new EventStreamServer()
