# Dead-Letter Queues

A **dead-letter queue** (DLQ) is where RabbitMQ parks messages that couldn't be processed normally — for example, messages that were rejected, expired, or exceeded a retry limit. DLQs are where you investigate failures and decide what to do with the stragglers.

## How Rabbit Wrangler spots a DLQ

Rabbit Wrangler flags a queue as a dead-letter queue when its **name ends with a configured suffix**. The defaults are:

- `.dlq`
- `.dead`
- `_dlq`
- `deadletter`
- `_error`
- `_skipped`

You can customize this list — add your own suffixes or remove the defaults — in [Settings](./settings).

A queue that matches gets a **DLQ badge** in the sidebar tree, so dead-letter queues are easy to pick out at a glance.

::: tip
The badge updates instantly when you change the suffix list — no need to reconnect or refresh.
:::

## Reading why a message died

When you peek a dead-lettered message and open its detail pane, the **`x-death` history** is broken out for you. It tells you:

- which **queue** the message was dead-lettered from,
- the **reason** it was dead-lettered, and
- how many **times** it has been dead-lettered.

This is usually enough to understand what went wrong before you decide whether to retry or discard.

## Returning dead-letters

To replay dead-lettered messages back to their original queue, use **Move** with a **blank target exchange**. The default exchange routes by routing key to the queue of the same name, so the messages return to where they started. See [Moving & purging](./moving-and-purging) for the full steps.
