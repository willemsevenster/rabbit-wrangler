# Getting Started

Rabbit Wrangler is a desktop app for operating your RabbitMQ clusters. It is built for the day-to-day _message_ work that feels clumsy in the RabbitMQ Management UI: watching what is actually flowing through a queue right now, rescuing messages from dead-letter queues, and purging or publishing — all with safety rails around the destructive bits. If you spend your day reaching for the browser-based management console, Rabbit Wrangler is faster.

## Installing

Pick the download for your platform:

- **Windows** — run the installer (`.exe`). It installs the app and adds a Start menu shortcut.
- **Linux** — choose the **AppImage** (download, mark executable, run), or install the **`.deb`** or **`.rpm`** package for your distribution.
- **macOS** — not currently packaged. You can build it from source if you need it on a Mac.

## First launch

When you open Rabbit Wrangler for the first time, you will see an empty workspace — there are no connections yet. That is expected. Your first job is to tell the app about a broker.

The quick path:

1. **Add a connection** — give the app your broker's host and credentials.
2. **Click the connection** to connect to it. Its queues and exchanges appear in the sidebar tree.
3. **Click a queue** to start peeking at the live messages flowing through it.

That is the whole loop. From there you can move messages, purge queues, publish, and inspect bindings.

## Staying up to date

Rabbit Wrangler checks for new versions automatically in the background. When an update is available you can download it from the title bar, and the app will **prompt you to restart** to finish installing — your work is never interrupted mid-task.

::: tip
You can control whether updates download automatically in **Settings**.
:::

## Next steps

- [Set up your connections](./connections) — add, edit, import, and export brokers.
- [Peek at messages](./peeking-messages) — watch a queue without consuming anything.
