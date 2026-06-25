import type {
  DeleteMessageRequest,
  ExportMessagesRequest,
  MoveMessageRequest,
  MoveMessagesRequest,
  OperationResult
} from '@shared/types'
import { fingerprintOf } from './fingerprint'
import type { AmqpConnection } from './amqp'

type ConfirmChannel = Awaited<ReturnType<AmqpConnection['createConfirmChannel']>>
type GetMsg = Exclude<Awaited<ReturnType<ConfirmChannel['get']>>, false>

/**
 * Destructive, message-level operations performed over AMQP.
 *
 * `moveMessages` is the classic "shovel the DLQ back to its source" workflow:
 * consume from the source queue, republish each message to a target
 * exchange/routing-key, and only ack the original once the publish is confirmed.
 *
 * Safety:
 *   - A confirm channel means we never ack a message we failed to republish, so
 *     a crash mid-move can at worst duplicate, never drop.
 *   - `mandatory` + the `return` listener catch an unroutable target (e.g. a
 *     typo'd queue name on the default exchange, which would otherwise silently
 *     discard the message yet still ack). On a return we nack-requeue the
 *     original and stop, leaving the rest in the source queue.
 */
export async function moveMessages(
  conn: AmqpConnection,
  req: MoveMessagesRequest
): Promise<OperationResult> {
  const channel = await conn.createConfirmChannel()
  let affected = 0
  let returned = false
  channel.on('return', () => {
    returned = true
  })

  try {
    const limit = req.limit ?? Infinity
    // Drain loop: pull one message at a time until the queue is empty or we hit the limit.
    while (affected < limit) {
      const msg = await channel.get(req.sourceQueue, { noAck: false })
      if (msg === false) break // queue empty

      returned = false
      channel.publish(req.targetExchange, req.targetRoutingKey, msg.content, {
        ...msg.properties,
        headers: msg.properties.headers,
        mandatory: true
      })
      await channel.waitForConfirms()

      if (returned) {
        // Unroutable target: put the message back and abort rather than lose it.
        channel.nack(msg, false, true)
        return {
          ok: false,
          affected,
          error:
            `Target is unroutable (exchange "${req.targetExchange || '(default)'}", ` +
            `routing key "${req.targetRoutingKey}"). ${affected} message(s) moved; ` +
            `the rest were left in "${req.sourceQueue}".`
        }
      }

      channel.ack(msg)
      affected++
    }
    return { ok: true, affected }
  } catch (err) {
    return { ok: false, affected, error: err instanceof Error ? err.message : String(err) }
  } finally {
    await channel.close().catch(() => undefined)
  }
}

/** How many head messages to scan looking for the target before giving up. The
 * UI can only ever select a message from the head window, so this is generous. */
const MAX_SCAN = 1000

/**
 * Pull messages one at a time until one matches `fingerprint`, run `act` on it,
 * then requeue everything else pulled. Non-matching messages are held unacked
 * and put back via nack(requeue) — and the broker also requeues any still-unacked
 * on channel close, so nothing is lost even if `act` throws.
 */
async function findAndAct(
  conn: AmqpConnection,
  queue: string,
  fingerprint: string,
  act: (channel: ConfirmChannel, msg: GetMsg) => Promise<OperationResult>
): Promise<OperationResult> {
  const channel = await conn.createConfirmChannel()
  const held: GetMsg[] = []
  const requeueHeld = (): void => {
    for (const h of held) {
      try {
        channel.nack(h, false, true)
      } catch {
        // channel closing — broker requeues unacked anyway
      }
    }
  }
  try {
    for (let scanned = 0; scanned < MAX_SCAN; scanned++) {
      const msg = await channel.get(queue, { noAck: false })
      if (msg === false) break // queue empty
      if (fingerprintOf(msg) === fingerprint) {
        const result = await act(channel, msg)
        requeueHeld()
        return result
      }
      held.push(msg)
    }
    requeueHeld()
    return {
      ok: false,
      affected: 0,
      error: 'Message not found in the queue (it may have already been consumed, moved or deleted).'
    }
  } catch (err) {
    requeueHeld()
    return { ok: false, affected: 0, error: err instanceof Error ? err.message : String(err) }
  } finally {
    await channel.close().catch(() => undefined)
  }
}

/** Move exactly one message (matched by fingerprint) to a target, confirmed. */
export async function moveMessage(
  conn: AmqpConnection,
  req: MoveMessageRequest
): Promise<OperationResult> {
  return findAndAct(conn, req.sourceQueue, req.fingerprint, async (channel, msg) => {
    let returned = false
    const onReturn = (): void => {
      returned = true
    }
    channel.once('return', onReturn)
    channel.publish(req.targetExchange, req.targetRoutingKey, msg.content, {
      ...msg.properties,
      headers: msg.properties.headers,
      mandatory: true
    })
    await channel.waitForConfirms()
    channel.removeListener('return', onReturn)
    if (returned) {
      channel.nack(msg, false, true)
      return {
        ok: false,
        affected: 0,
        error:
          `Target is unroutable (exchange "${req.targetExchange || '(default)'}", ` +
          `routing key "${req.targetRoutingKey}"). The message was left in "${req.sourceQueue}".`
      }
    }
    channel.ack(msg)
    return { ok: true, affected: 1 }
  })
}

/** Delete exactly one message (matched by fingerprint) from its queue. */
export async function deleteMessage(
  conn: AmqpConnection,
  req: DeleteMessageRequest
): Promise<OperationResult> {
  return findAndAct(conn, req.sourceQueue, req.fingerprint, async (channel, msg) => {
    channel.ack(msg)
    return { ok: true, affected: 1 }
  })
}

/** A queue message serialized for file export (mirrors PeekedMessage's payload
 * handling; `payloadEncoding` matches the publish contract for round-tripping). */
export interface ExportedMessage {
  exchange: string
  routingKey: string
  redelivered: boolean
  properties: Record<string, unknown>
  headers: Record<string, unknown>
  payload: string
  payloadEncoding: 'string' | 'base64'
  fingerprint: string
}

/**
 * Read all currently-ready messages from a queue WITHOUT consuming them: each is
 * fetched with manual ack and held unacked; closing the channel requeues every
 * one (the broker requeues unacked on channel close), so the queue is unchanged.
 * Same non-destructive contract as peek/move — only ready messages are visible,
 * so callers stop the peeker first.
 */
export async function exportMessages(
  conn: AmqpConnection,
  req: ExportMessagesRequest
): Promise<ExportedMessage[]> {
  const channel = await conn.createChannel()
  const held: GetMsg[] = []
  const out: ExportedMessage[] = []
  // undefined = export all; 0 = export none; negatives clamp to 0.
  const limit = req.limit === undefined ? Infinity : Math.max(0, req.limit)
  try {
    while (out.length < limit) {
      const msg = await channel.get(req.queue, { noAck: false })
      if (msg === false) break // queue drained of ready messages
      held.push(msg)
      const binary = !isUtf8(msg.content)
      const { headers, ...properties } = msg.properties
      out.push({
        exchange: msg.fields.exchange,
        routingKey: msg.fields.routingKey,
        redelivered: msg.fields.redelivered,
        properties: properties as Record<string, unknown>,
        headers: (headers as Record<string, unknown>) ?? {},
        payload: binary ? msg.content.toString('base64') : msg.content.toString('utf8'),
        payloadEncoding: binary ? 'base64' : 'string',
        fingerprint: fingerprintOf(msg)
      })
    }
    return out
  } finally {
    // Requeue everything we held, then close (close also requeues any stragglers).
    for (const h of held) {
      try {
        channel.nack(h, false, true)
      } catch {
        // channel closing — broker requeues unacked anyway
      }
    }
    await channel.close().catch(() => undefined)
  }
}

/** Best-effort check that a buffer is valid UTF-8 (so we don't mangle binaries). */
function isUtf8(buf: Buffer): boolean {
  return Buffer.compare(Buffer.from(buf.toString('utf8'), 'utf8'), buf) === 0
}
