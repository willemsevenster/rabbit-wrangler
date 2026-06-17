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
