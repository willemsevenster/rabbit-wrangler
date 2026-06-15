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
