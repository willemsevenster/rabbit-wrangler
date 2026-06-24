# Exchanges

Exchanges are the routers of RabbitMQ: messages are published to an exchange, which decides — based on its bindings — where to deliver them. Rabbit Wrangler lets you browse exchanges, see how they route, and send test messages.

## Browsing exchanges

Exchanges appear under their own **Exchanges** group in the sidebar tree, separate from queues. Click an exchange to open it.

## Creating an exchange

Right-click the **Exchanges** group and choose **Create Exchange…**. Enter a **name**, pick a **type** (direct / fanout / topic / headers), choose **Durable** (recommended), **Auto-delete**, and **Internal** as needed, and optionally add **Arguments** (for example `alternate-exchange`). The new exchange opens in its own tab, ready to bind.

## Bindings and the routing diagram

Opening an exchange shows its **bindings**. Alongside the binding list is a **diagram** showing where the exchange routes: from the exchange to its destination queues and exchanges — a quick way to understand the flow without reading binding tables line by line.

### Adding and removing bindings

Click **Add Binding** above the binding list to route the exchange to a **queue** or **another exchange**: pick the destination type, choose the destination, and set a **routing key** (optional for fanout / headers exchanges). For a **headers** exchange, add the match criteria under **Arguments** (`x-match` = `all` or `any`, plus the header names/values). Remove a binding with the trash button on its row. The list and diagram update immediately.

The **default exchange** can't have bindings added or removed — it binds every queue implicitly by name.

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
