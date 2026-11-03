import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { eventBus } from './event-bus'
import type { EventStreamEndpoint, StreamEvent } from '@shared/ipc'

/** WebSocket subprotocol prefix carrying the per-launch token (keeps it out of the URL). */
export const TOKEN_PROTOCOL_PREFIX = 'rw-token.'

/**
 * Localhost WebSocket that pushes the live event stream to the renderer.
 *
 * Why a WebSocket rather than IPC `webContents.send`? Peeked messages can arrive
 * at high frequency; a dedicated socket keeps that firehose off the IPC channel
 * (which stays request/response only) and lets the renderer use one uniform
 * subscribe/backpressure model. We bind to 127.0.0.1 on an ephemeral port and
 * hand the port to the renderer via the `events:endpoint` IPC call.
 *
 * The stream carries message payloads, so it is NOT open to anything on the
 * machine: every launch mints a random token that only the renderer receives
 * (over IPC), and a client must present it as a `rw-token.<token>` subprotocol.
 * The Origin is checked too, so a web page in a browser — which can open a
 * WebSocket to 127.0.0.1 regardless of CORS — is refused even if it guessed
 * the port.
 */
class EventStreamServer {
  private wss: WebSocketServer | null = null
  private port = 0
  private readonly token = randomBytes(32).toString('hex')
  private unsubscribe: (() => void) | null = null

  start(): Promise<number> {
    if (this.wss) return Promise.resolve(this.port)
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({
        host: '127.0.0.1',
        port: 0,
        verifyClient: ({ req }) => this.isAuthorized(req),
        // Echo our token protocol back so the browser accepts the handshake.
        handleProtocols: (protocols) =>
          [...protocols].find((p) => p.startsWith(TOKEN_PROTOCOL_PREFIX)) ?? false
      })
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

  /** Token + Origin gate for the upgrade request. */
  private isAuthorized(req: IncomingMessage): boolean {
    if (!isAllowedOrigin(req.headers.origin)) return false
    const offered = (req.headers['sec-websocket-protocol'] ?? '')
      .split(',')
      .map((p) => p.trim())
      .find((p) => p.startsWith(TOKEN_PROTOCOL_PREFIX))
    if (!offered) return false
    const given = Buffer.from(offered.slice(TOKEN_PROTOCOL_PREFIX.length))
    const expected = Buffer.from(this.token)
    return given.length === expected.length && timingSafeEqual(given, expected)
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

  getEndpoint(): EventStreamEndpoint {
    return { port: this.port, token: this.token }
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

/** The packaged renderer is a file:// page; in dev it is the electron-vite server. */
function isAllowedOrigin(origin: string | undefined): boolean {
  if (origin === 'file://') return true
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl && origin) {
    try {
      return new URL(devUrl).origin === origin
    } catch {
      return false
    }
  }
  return false
}

export const eventStreamServer = new EventStreamServer()
