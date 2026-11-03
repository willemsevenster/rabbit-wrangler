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

/** Budget for the connect-time AMQP probe (a full handshake, so a little longer than a TCP connect). */
const PROBE_TIMEOUT_MS = 5000

/**
 * Can we actually speak AMQP to the broker? A full AMQP connect followed by a
 * graceful `connection.close` — not a bare TCP connect, because a port-forward,
 * load balancer or unrelated service on the port accepts TCP even when no broker
 * answers behind it. A TCP-only probe then picked the AMQP transport and every
 * peek failed; now any failure (refused, timeout, not AMQP, bad credentials or
 * vhost, TLS) falls back to HTTP browse. The clean close also matters:
 * `kubectl port-forward` can exit when a forwarded connection is cut mid-handshake.
 */
export async function probeAmqpReachable(
  config: ConnectionConfig,
  timeoutMs = PROBE_TIMEOUT_MS
): Promise<boolean> {
  try {
    const conn = await connectAmqp(config, timeoutMs)
    await conn.close().catch(() => undefined)
    return true
  } catch {
    return false
  }
}
