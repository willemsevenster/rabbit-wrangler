# Settings

Settings let you tailor Rabbit Wrangler to how you work.

## Opening Settings

Open Settings from the **gear icon** at the bottom of the activity bar, or from **View → Settings**.

## Options

### Theme

Choose **Light** or **Dark**. On first run, Rabbit Wrangler follows your operating system's theme automatically; change it here any time.

### Max messages to show

Sets how many messages each queue tab keeps (between **10** and **9,999**, default **1,000**). When a tab reaches the limit, its oldest messages drop off to make room. See [Peeking at messages](./peeking-messages).

### Confirm before destructive actions

When on, **purge** and **delete** ask you to confirm before they run. Turn it off to skip the prompt if you do these operations often. See [Moving & purging](./moving-and-purging).

::: warning
Turning this off means purge and delete happen immediately, with no confirmation step.
:::

### Auto-connect saved clusters on launch

When on, Rabbit Wrangler connects to all your saved brokers as soon as it starts, so your queues are ready without clicking each connection.

### Updates

Check for updates now, see the current update status, and toggle whether updates **download automatically**. However you update, the app prompts you to restart before installing. See [Getting started](./getting-started).

### Dead-letter queue suffixes

Manage the list of name suffixes that mark a queue as a dead-letter queue. **Add** or **remove** suffixes, or **reset** the list to the defaults. Changes re-badge your queues instantly. See [Dead-letter queues](./dead-letter-queues).
