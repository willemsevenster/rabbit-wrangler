import { createHash } from 'node:crypto'

/** The minimal shape of an amqplib message we need to fingerprint (both
 * `ConsumeMessage` from a consumer and `GetMessage` from `channel.get` match). */
interface Fingerprintable {
  fields: { routingKey: string }
  properties: { messageId?: unknown; correlationId?: unknown }
  content: Buffer
}

/**
 * Content-based identity for a message, used both to de-duplicate the live peek
 * feed and to locate one specific message again for move/delete. Prefers the
 * publisher-set `messageId`; otherwise hashes routing key + correlationId + body.
 *
 * Keep this the single source of truth — the peeker and the move/delete scan
 * MUST agree, or "move this message" would act on the wrong one (or nothing).
 */
export function fingerprintOf(msg: Fingerprintable): string {
  const messageId = msg.properties.messageId
  if (messageId) return `id:${messageId}`
  return (
    'h:' +
    createHash('sha1')
      .update(msg.fields.routingKey)
      .update('\0')
      .update(String(msg.properties.correlationId ?? ''))
      .update('\0')
      .update(msg.content)
      .digest('hex')
  )
}
