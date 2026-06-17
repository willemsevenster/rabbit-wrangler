# Exchanges

Exchanges are the routers of RabbitMQ: messages are published to an exchange, which decides — based on its bindings — where to deliver them. Rabbit Wrangler lets you browse exchanges, see how they route, and send test messages.

## Browsing exchanges

Exchanges appear under their own **Exchanges** group in the sidebar tree, separate from queues. Click an exchange to open it.

## Bindings and the routing diagram

Opening an exchange shows its **bindings**, which are **read-only** here — Rabbit Wrangler displays them for inspection but doesn't edit them. Alongside the binding list is a **diagram** showing where the exchange routes: from the exchange to its destination queues and exchanges. It's a quick way to understand the flow without reading binding tables line by line.

## Publishing a test message

Use the **Publish** dialog to send a test message through an exchange. After you publish, the app reports whether the message was **routed** to a destination or came back **unroutable** — so you can tell immediately whether your routing key and bindings line up.

::: tip
"Unroutable" usually means no binding matched your routing key. Check the binding diagram and try again.
:::

## Deleting an exchange

You can delete an exchange you no longer need. Two kinds are protected and cannot be deleted:

- the **default exchange**, and
- the built-in **`amq.*` exchanges** (the ones RabbitMQ ships with).

## The default exchange

Every broker has a **default exchange** — a nameless exchange that every queue is automatically bound to by its own name. Publishing to it with a routing key equal to a queue's name delivers straight to that queue. This is exactly what makes returning dead-letters simple: see [Moving & purging](./moving-and-purging).
