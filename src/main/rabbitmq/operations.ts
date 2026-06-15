import type { MoveMessagesRequest, OperationResult } from '@shared/types'
import type { AmqpConnection } from './amqp'

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
