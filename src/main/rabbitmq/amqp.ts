import net from 'node:net'
import amqp from 'amqplib'
import type { ConnectionConfig } from '@shared/types'

/**
 * Connection/channel types derived from amqplib's own signatures so we are
 * insulated from the `Connection`/`ChannelModel` naming churn across 0.10.x.
 */
export type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>
export type AmqpChannel = Awaited<ReturnType<AmqpConnection['createChannel']>>

export function buildAmqpUrl(config: ConnectionConfig): string {
  const scheme = config.tls ? 'amqps' : 'amqp'
  const auth = `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}`
  const vhost = encodeURIComponent(config.vhost)
  return `${scheme}://${auth}@${config.host}:${config.amqpPort}/${vhost}`
}

/** Budget for opening an AMQP connection, TCP + AMQP/TLS handshake included. */
const CONNECT_TIMEOUT_MS = 15_000

/**
 * Open an AMQP connection, giving up after `timeoutMs`. Without a bound, an
 * endpoint that accepts TCP but never completes the handshake would stall
 * peek/move — and dispose(), which waits for a connect in flight — indefinitely.
 * A connection that lands after the deadline is closed, not leaked.
 */
export function connectAmqp(
  config: ConnectionConfig,
  timeoutMs = CONNECT_TIMEOUT_MS
): Promise<AmqpConnection> {
  return new Promise((resolve, reject) => {
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      reject(
        new Error(
          `AMQP connection to ${config.host}:${config.amqpPort} timed out after ${timeoutMs / 1000}s.`
        )
      )
    }, timeoutMs)
    amqp
      // Also bounds the socket connect itself, so the attempt doesn't linger.
      .connect(buildAmqpUrl(config), { timeout: timeoutMs })
      .then((conn) => {
        clearTimeout(timer)
        if (timedOut) void conn.close().catch(() => undefined)
        else resolve(conn)
      })
      .catch((err: unknown) => {
        clearTimeout(timer)
        if (!timedOut) reject(err)
      })
  })
}

/** Default time to wait for the AMQP port to accept a TCP connection. */
const PROBE_TIMEOUT_MS = 2500

/**
 * Is the broker's AMQP port reachable? A plain TCP connect (no AMQP/TLS
 * handshake) — enough to tell "the port accepts connections" from "a firewall is
 * blocking 5672". When this is false we force the HTTP browse path. A TLS broker
 * still accepts the TCP connection, so we don't do the TLS handshake here.
 */
export function probeAmqpReachable(
  config: ConnectionConfig,
  timeoutMs = PROBE_TIMEOUT_MS
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(config.amqpPort, config.host)
  })
}
