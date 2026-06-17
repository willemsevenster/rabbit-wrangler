# Moving & Purging

Rabbit Wrangler can move messages between queues and clear queues out entirely — with safety rails so you don't lose data by accident.

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

## Purge a queue

Purging **clears all messages** in a queue. Right-click the queue to purge it.

::: warning
Purging is **irreversible** — purged messages cannot be recovered.
:::

## The confirmation setting

The **Confirm before destructive actions** setting controls whether purge and delete ask you to confirm first. Leave it on for safety; turn it off if you do these operations often and don't want the extra step. See [Settings](./settings).
