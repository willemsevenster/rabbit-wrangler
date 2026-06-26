# Connections

A connection points Rabbit Wrangler at one RabbitMQ broker. You can have as many as you like and switch between them from the sidebar.

## Adding a connection

1. Open the dialog to add a new connection.
2. Fill in the fields:
   - **Name** — a friendly label for the broker (shown in the tree).
   - **Host** — the broker's hostname or IP address.
   - **AMQP port** — the messaging port (default **5672**).
   - **Management port** — the management API port (default **15672**).
   - **Virtual host** — the vhost to operate in (default **/**).
   - **Username** and **Password** — your broker credentials.
   - **TLS** — turn this on if your broker uses encrypted connections.
3. Save.

Saving a connection **automatically connects it** and opens its overview, so you go straight to work.

## Editing a connection

When you edit an existing connection, the **password field starts blank**. This is on purpose — the app never shows you the stored password. Leave it blank to keep the existing password, or type a new one to replace it.

## How your credentials are protected

Passwords are encrypted using your operating system's secure storage before they are saved, and they **never leave your machine**. Only the app's background process can decrypt them — the rest of the app never sees the plaintext.

## Importing and exporting

Export and import make it easy to share a set of brokers across machines or with teammates.

- **Export** writes your connections to a JSON file **without passwords** (the encrypted blobs can't be decrypted on another machine, so they are left out).
- **Import** reads a connections file and opens a dialog where you can:
  - set a **password** for each connection, and
  - resolve **name collisions** — choose **Skip**, **Overwrite**, or **Import as a copy** (added with a numbered suffix).

## The sidebar tree

The tree shows **one connection's contents at a time** to keep things tidy. Use the **Collapse All** button in the toolbar to fold the tree back to the connection level, and each connection row has its own **expand/collapse** toggle for its queues and exchanges.

## Cluster health

A connection's **Overview tab** opens with a cluster summary above the queue list:

- **Version**, cluster name, and live totals (queues, connections, channels, consumers).
- Cluster-wide **publish / deliver / ack rates**.
- A card per **broker node** showing memory used vs. limit, free disk, file-descriptor usage and uptime.

These update on their own every few seconds — for every connected cluster, not just the one you're looking at.

### Resource alarms

If a node trips its **memory** or **disk** high-watermark, RabbitMQ **blocks publishers** and queues can sit in a `flow` state. Rabbit Wrangler surfaces this loudly: the node card shows a red **memory alarm** / **disk alarm** badge, the Overview tab shows a banner, and the **status bar** shows a high-contrast alarm chip — so a stuck cluster is obvious at a glance. When a connection is reachable but in alarm, its dot in the tree and status bar turns **amber (degraded)**.

### Checking health on demand

Right-click a connected broker and choose **Check Health** to run a deep liveness probe (`/aliveness-test`): the broker declares a temporary queue, publishes and consumes a message, then removes it. Unlike the connection check (which only verifies your credentials), this proves the broker can actually **move a message** on your virtual host — and reports the broker's own reason if it can't.

## Policies

Right-click a connected broker and choose **View Policies** to open a tab listing the virtual host's policies. Policies apply settings to every queue or exchange whose name matches a pattern — the standard way to configure **dead-lettering, TTLs, and length limits** in bulk.

- **Add Policy** / **Edit** open a dialog where you set the **name**, a **pattern** (regex matched against names), **apply-to** (all / queues / exchanges), a **priority**, and the **definition** — typed key/value entries such as `message-ttl` (Number), `max-length` (Number), or `dead-letter-exchange` (String).
- **Delete** removes a policy (matching objects lose their settings).

This is the configuration counterpart to moving dead-letters: set a queue's DLX or TTL here, then use [Move](./moving-and-purging) to recover messages operationally.

::: warning
Managing policies requires a broker user with the **administrator** (or **policymaker**) tag.
:::

## Backing up the topology (definitions)

Right-click a connected broker for **Export Definitions…** and **Import Definitions…** — a backup/restore for the virtual host's **topology**: its queues, exchanges, bindings, and policies.

- **Export** writes the vhost's definitions to a JSON file. Because it's scoped to the vhost, the file contains **no users, permissions, or passwords** — just topology. Great for backups, diffing environments, or copying a setup to staging.
- **Import** reads a definitions file, shows you what it contains (counts of queues / exchanges / bindings / policies), and after you confirm, applies it. Import is **additive**: matching objects are created or updated, and **nothing is deleted**.

::: warning
Definitions are an administrative operation — they require a broker user with the **administrator** tag. With a locked-down user you'll get a permission error.
:::

## Client connections & consumers

Right-click a connected broker and choose **View Connections** to open a tab listing:

- **Connections** — every live client connected to the broker: name, user, virtual host, protocol, channel count and state. Each row has a **Force Close** button that drops that connection (and its channels and consumers).
- **Consumers** — every consumer on your virtual host: which **queue** it's on, its consumer tag, the **connection** it belongs to, ack mode, prefetch, and whether it's currently active.

This is the fastest way to answer "**why won't this queue drain / why can't I move these messages?**" — a live consumer is competing for the queue's messages. Find it in the Consumers list, note its connection, and **Force Close** that connection to release the queue.

::: warning
Force-closing a connection is immediate and affects a real client — it will have to reconnect. You'll always be asked to confirm first.
:::
