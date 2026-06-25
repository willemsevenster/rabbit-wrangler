# Moving & Purging

Rabbit Wrangler can create and delete queues, move messages between queues, and clear queues out entirely — with safety rails so you don't lose data by accident.

## Create a queue

1. Right-click the **Queues** group in the tree (or click **New Queue** on a connection's overview tab) and choose **Create Queue…**.
2. Enter a **name**, choose **Durable** (recommended — survives a broker restart) and optionally **Auto-delete**.
3. Add any **Arguments** (x-args) you need — for example `x-dead-letter-exchange` (String) or `x-message-ttl` (Number). Pick the right value **type** so numbers are sent as numbers.
4. Click **Create queue**.

A new queue is automatically bound to the default exchange by its name, so you can immediately use it as a **move/redrive target** (see below). Re-creating a queue with the exact same settings is harmless; trying to re-create it with *different* settings is rejected by the broker.

## Move a whole queue

1. Right-click a queue in the tree and choose **Move Messages…**.
2. Pick the **target exchange** and **routing key**.
3. Confirm.

Messages are drained from the source and republished to the target with **publisher confirms** — the original is only removed once the broker has confirmed the copy. A crash mid-move can therefore duplicate a message but **never drop one**.

If the target turns out to be **unroutable** (for example, a typo'd queue name), the move **aborts** rather than discarding messages.

## Move or delete a single message

To act on just one message, right-click it in the table (or use the buttons in the detail pane) and choose **Move** or **Delete**.

The Move dialog remembers and defaults to the **last destination you used for that source queue**, so repeated moves are quick.

## Returning dead-letters to their original queue

To replay dead-lettered messages back to where they came from, **leave the target exchange blank**. The default (nameless) exchange routes by routing key straight to the queue with that name — so a dead-letter whose routing key matches its original queue lands right back home. See [Dead-letter queues](./dead-letter-queues) for more.

## Export messages to a file

Before a destructive move or purge, you can snapshot a queue's messages to disk. Right-click a queue and choose **Export Messages…**, then pick a location and format:

- **NDJSON** (default) — one JSON message per line; greppable and stream-friendly for large queues.
- **JSON** — a single pretty-printed array.

Each record carries the exchange, routing key, redelivered flag, properties, headers, and the payload (UTF-8, or base64 with `payloadEncoding: "base64"` for binary).

The export is **non-destructive**: messages are read and **requeued** (the same hold-and-requeue technique as peeking) rather than consumed, so none are removed. Note that — like peeking — requeueing marks the messages **redelivered** and can change their order; nothing is lost, but the broker state isn't byte-for-byte preserved. As with peek and move, only the queue's **ready** messages are captured (in-flight/unacked messages held by other consumers are not).

::: tip
Use this as an audit trail or a safety net — export a dead-letter queue right before you redrive or purge it.
:::

## Purge a queue

Purging **clears all messages** in a queue. Right-click the queue to purge it.

::: warning
Purging is **irreversible** — purged messages cannot be recovered.
:::

## Delete a queue

Deleting removes the **whole queue** (and any messages it still holds), not just its contents. Right-click a queue and choose **Delete Queue…**.

The dialog shows the queue's current **message and consumer counts**, and offers two safety guards:

- **Only delete if empty** — the broker refuses the delete if the queue still has messages.
- **Only delete if unused** — the broker refuses if the queue still has consumers.

If a guard blocks the delete, the reason is shown right in the dialog so you can adjust and retry. Deleting a queue **always** asks for explicit confirmation through this dialog, regardless of the [confirm-before-destructive setting](./settings).

::: tip
To empty a queue but keep it, use **Purge** instead.
:::

## The confirmation setting

The **Confirm before destructive actions** setting controls whether **purge** and **single-message delete** ask you to confirm first. Leave it on for safety; turn it off if you do these operations often and don't want the extra step.

**Deleting a whole queue is always confirmed** through its own dialog — which also carries the *only if empty / only if unused* safety guards — regardless of this setting. See [Settings](./settings).
