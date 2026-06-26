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

export function connectAmqp(config: ConnectionConfig): Promise<AmqpConnection> {
  return amqp.connect(buildAmqpUrl(config))
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
