# Search

Search helps you find a specific message among everything you've already peeked, across every open queue tab at once.

## Opening search

Press **Ctrl+F** (**Cmd+F** on macOS) to open the search popup.

::: info
Search filters the messages you have **already peeked** — it does **not** query the broker. If a message hasn't been peeked into one of your open tabs, search can't see it. Open the queue and let it peek first.
:::

## What it searches

Search looks across all your open queue tabs and matches against each message's:

- **payload**,
- **routing key**,
- **exchange**,
- **headers**, and
- **properties**.

## Match options

Two toggles refine how your text is matched:

- **Aa** — match case. When on, `Order` and `order` are treated as different.
- **.\*** — regular expressions. When on, your query is treated as a regex pattern. An invalid pattern is reported **inline**, so you can fix it without anything crashing.

## Working with results

Results appear **newest-first** and update **live** — as new matching messages arrive in your peeked queues, they appear at the top automatically.

1. Select a result to open its full **details and payload** in the pane.
2. From there, **Move** and **Delete** are available, just as in the queue view.

Both the result list and the detail pane are **resizable** — drag the divider to balance them.
