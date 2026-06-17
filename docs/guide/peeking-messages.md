# Peeking at Messages

Peeking lets you watch the messages flowing through a queue **without consuming them**. Rabbit Wrangler reads each live message and immediately returns it to the queue, so nothing is removed and no other consumer is starved.

## How peeking works

1. Click a queue in the sidebar tree.
2. The queue opens and starts showing its messages in a table.

Each unique message is shown **once** — the app de-duplicates, so a message the broker keeps redelivering won't pile up as repeated rows.

::: info
Only the messages at the **head of the queue** are visible. Peeking shows you what's at the front, not the entire backlog of a deep queue.
:::

## Inspecting a message

Click any row in the table to open the **detail pane** below it. The detail pane shows:

- the **exchange** the message arrived on,
- its **size**,
- the AMQP **properties**,
- the **headers** — including the dead-letter `x-death` history, broken out so you can see where a message has been,
- and the **payload** in a read-only editor.

Both the table and the detail pane are **resizable** — drag the dividers to give yourself more room for the list or the payload.

## Tabs and background peeking

Each queue you open gets its own **tab**. A tab keeps peeking **in the background** even when you switch to another tab, so you never lose your place. Background tabs that have seen new messages show an **unread badge**.

To start fresh in a tab, use its in-tab **Refresh** — this clears the tab and re-reads from the head of the queue.

## How many messages are kept

Each tab holds up to the **Max messages to show** limit (default **1,000**). Once a tab reaches that limit, the oldest messages drop off to make room for new ones. You can change the limit in [Settings](./settings).
