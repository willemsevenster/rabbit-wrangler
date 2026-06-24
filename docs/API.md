# Rabbit Wrangler — API Reference

Rabbit Wrangler talks to each cluster over **two planes** (see
[CLAUDE.md](https://github.com/willemsevenster/rabbit-wrangler/blob/main/CLAUDE.md)):

- **Management HTTP API** — the `rabbitmq_management` plugin (default port
  `15672`). The management plane: list/inspect/purge, publish, bindings.
- **AMQP** (`amqplib`, default port `5672`). The message plane: peek, move and delete.

Internally the renderer never speaks either protocol directly — it calls
`window.api.*` (request/response over Electron IPC) and listens to a localhost
WebSocket for the live event firehose. This document covers all three layers:

1. [The app's own API (`window.api` / `RabbitApi`)](#1-the-apps-own-api-windowapi--rabbitapi) — what the UI can call today.
2. [Management HTTP API coverage map](#2-management-http-api-coverage-map) — the full broker API, what we use, what's worth adding.
3. [AMQP message plane](#3-amqp-message-plane) — what we do over AMQP.
4. [Suggested additions (roadmap)](#4-suggested-additions-roadmap) — prioritized.

**Legend:** ✅ implemented · ⭐ suggested (high value) · ◻︎ available, lower priority

---

## 1. The app's own API (`window.api` / `RabbitApi`)

Defined in [`src/shared/ipc.ts`](../src/shared/ipc.ts), bridged in
[`src/preload/index.ts`](../src/preload/index.ts), handled in
[`src/main/ipc.ts`](../src/main/ipc.ts). Every method below is **implemented**.

> Extending this contract means touching four files in lockstep: the channel +
> method in `src/shared/ipc.ts`, the bridge in `src/preload/index.ts`, the
> handler in `src/main/ipc.ts`, and the behavior in `ClusterConnection` /
> `ConnectionManager` / `ManagementApi`.

### Connection registry & credentials

| Method                                         | IPC channel              | Backed by            | Notes                                                          |
| ---------------------------------------------- | ------------------------ | -------------------- | -------------------------------------------------------------- |
| `listConnections(): Promise<SafeConnectionConfig[]>`                  | `connections:list`       | `config-store`       | Returns configs **without** passwords.                         |
| `saveConnection(config: ConnectionConfig): Promise<SafeConnectionConfig>` | `connections:save`       | `config-store`       | Password encrypted via OS vault (`safeStorage`).               |
| `deleteConnection(id: string): Promise<void>`                         | `connections:delete`     | registry + store     | Disconnects first, then removes the saved config.              |
| `connect(id: string): Promise<void>`                                  | `connections:connect`    | `connection-manager` | Verifies the management endpoint (`/whoami`); AMQP stays lazy. |
| `disconnect(id: string): Promise<void>`                               | `connections:disconnect` | `connection-manager` | Disposes peekers + AMQP connection.

### Queues (management plane)

| Method                                             | IPC channel    | Maps to broker call                                 |
| -------------------------------------------------- | -------------- | --------------------------------------------------- |
| `listQueues(connectionId: string): Promise<QueueInfo[]>`            | `queues:list`  | `GET /api/queues/{vhost}`                           |
| `purgeQueue(connectionId: string, queue: string): Promise<OperationResult>` | `queues:purge` | `GET …/{name}` (count) + `DELETE …/{name}/contents` |

### Exchanges (management plane)

| Method                                                        | IPC channel          | Maps to broker call                                 |
| ------------------------------------------------------------- | -------------------- | --------------------------------------------------- |
| `listExchanges(connectionId: string): Promise<ExchangeInfo[]>`                 | `exchanges:list`     | `GET /api/exchanges/{vhost}`                        |
| `listExchangeBindings(connectionId: string, exchange: string): Promise<BindingInfo[]>` | `exchanges:bindings` | `GET /api/exchanges/{vhost}/{name}/bindings/source` |
| `deleteExchange(connectionId: string, exchange: string): Promise<OperationResult>`     | `exchanges:delete`   | `DELETE /api/exchanges/{vhost}/{name}`              |
| `publishMessage(request: PublishMessageRequest): Promise<OperationResult>`            | `exchanges:publish`  | `POST /api/exchanges/{vhost}/{name}/publish`        |

### Messages (AMQP plane)

| Method                                    | IPC channel          | Behavior                                                                |
| ----------------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| `startPeek(connectionId: string, queue: string): Promise<void>`    | `peek:start`         | Starts a NACK-and-requeue consumer; messages stream over the WebSocket. |
| `stopPeek(connectionId: string, queue: string): Promise<void>`     | `peek:stop`          | Cancels the consumer and releases held messages.                        |
| `moveMessages(request: MoveMessagesRequest): Promise<OperationResult>`  | `messages:move`      | Confirm-channel drain + republish (see §3).                             |
| `moveMessage(request: MoveMessageRequest): Promise<OperationResult>`    | `messages:moveOne`   | Move one message, matched by fingerprint (see §3).                      |
| `deleteMessage(request: DeleteMessageRequest): Promise<OperationResult>` | `messages:deleteOne` | Delete one message, matched by fingerprint (see §3).                    |

### Bootstrap & utilities

| Method                         | IPC channel   | Notes                                                                     |
| ------------------------------ | ------------- | ------------------------------------------------------------------------- |
| `getEventStreamPort(): Promise<number>` | `events:port` | Ephemeral `127.0.0.1` port of the event WebSocket.                        |
| `quitApp(): Promise<void>`              | `app:quit`    | Quits the application (Connections → Exit menu).                          |
| `copyText(text: string): void`          | _(none)_      | Handled entirely in preload via Electron `clipboard` — no IPC round-trip. |

### Event stream (WebSocket push)

`StreamEvent` is a discriminated union broadcast from `eventBus.emitStream(...)`:

| `type`              | Payload                                 | Emitted by                                                                        |
| ------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| `connection-status` | `ConnectionStatus`                      | `ClusterConnection.setState()` on connect/error/dispose.                          |
| `peek`              | `PeekedMessage`                         | `MessagePeeker` for each newly-seen message.                                      |
| `queue-stats`       | `{ connectionId, queues: QueueInfo[] }` | Defined in the contract for periodic stat pushes (see ⭐ live queue stats in §4). |

---

## 2. Management HTTP API coverage map

The complete `rabbitmq_management` HTTP API, grouped by resource. Paths are
relative to `http(s)://{host}:{managementPort}/api`. All requests use HTTP Basic
auth; vhost and exchange/queue names are URL-encoded (the default exchange is
addressed as `amq.default`, the default vhost `/` as `%2F`).

### Queues

| Status | Method | Path                              | Purpose                                                                                                   |
| ------ | ------ | --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| ✅     | GET    | `/queues/{vhost}`                 | List queues in a vhost (name, state, depth, consumers).                                                   |
| ✅     | GET    | `/queues/{vhost}/{name}`          | Single queue — read for the pre-purge count. _(Full detail not yet surfaced.)_                            |
| ✅     | DELETE | `/queues/{vhost}/{name}/contents` | Purge (delete ready messages).                                                                            |
| ⭐     | PUT    | `/queues/{vhost}/{name}`          | **Declare/create a queue** (e.g. a move target, a redrive queue).                                         |
| ⭐     | DELETE | `/queues/{vhost}/{name}`          | **Delete a queue** (not just purge). Supports `if-empty` / `if-unused`.                                   |
| ⭐     | POST   | `/queues/{vhost}/{name}/get`      | **Pull N messages** (HTTP browse with `ackmode=reject_requeue_true`) — an AMQP-free fallback peek/export. |
| ◻︎      | GET    | `/queues`                         | All queues across vhosts.                                                                                 |
| ◻︎      | GET    | `/queues/{vhost}/{name}/bindings` | Bindings terminating at a queue.                                                                          |
| ◻︎      | POST   | `/queues/{vhost}/{name}/actions`  | `sync` / `cancel_sync` (classic mirrored queues).                                                         |

### Exchanges

| Status | Method | Path                                             | Purpose                                                           |
| ------ | ------ | ------------------------------------------------ | ----------------------------------------------------------------- |
| ✅     | GET    | `/exchanges/{vhost}`                             | List exchanges in a vhost.                                        |
| ✅     | GET    | `/exchanges/{vhost}/{name}/bindings/source`      | Bindings where this exchange is the source (the binding diagram). |
| ✅     | DELETE | `/exchanges/{vhost}/{name}`                      | Delete an exchange.                                               |
| ✅     | POST   | `/exchanges/{vhost}/{name}/publish`              | Publish a message; reports `routed`.                              |
| ⭐     | PUT    | `/exchanges/{vhost}/{name}`                      | **Declare/create an exchange.**                                   |
| ◻︎      | GET    | `/exchanges/{vhost}/{name}`                      | Single exchange detail + `message_stats` (publish in/out rates).  |
| ◻︎      | GET    | `/exchanges/{vhost}/{name}/bindings/destination` | Bindings where this exchange is the destination (e2e).            |
| ◻︎      | GET    | `/exchanges`                                     | All exchanges across vhosts.                                      |

### Bindings

| Status | Method      | Path                                               | Purpose                                                              |
| ------ | ----------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| ⭐     | POST        | `/bindings/{vhost}/e/{exchange}/q/{queue}`         | **Create exchange→queue binding** (make the bindings view editable). |
| ⭐     | DELETE      | `/bindings/{vhost}/e/{exchange}/q/{queue}/{props}` | **Delete a binding.**                                                |
| ◻︎      | POST/DELETE | `/bindings/{vhost}/e/{src}/e/{dst}…`               | Exchange→exchange bindings.                                          |
| ◻︎      | GET         | `/bindings` · `/bindings/{vhost}`                  | All bindings.                                                        |

### Cluster, nodes & health

| Status | Method  | Path                                                                         | Purpose                                                                            |
| ------ | ------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| ⭐     | GET     | `/overview`                                                                  | Cluster totals, message rates, version, alarms — ideal for a dashboard/status bar. |
| ⭐     | GET     | `/nodes` · `/nodes/{name}`                                                   | Per-node memory/disk alarms, file descriptors, uptime, running state.              |
| ⭐     | GET     | `/health/checks/alarms`                                                      | Are any resource alarms firing? (modern health endpoint).                          |
| ◻︎      | GET     | `/aliveness-test/{vhost}`                                                    | Declares + publishes + consumes a throwaway message (deeper than `/whoami`).       |
| ◻︎      | GET     | `/health/checks/{local-alarms,certificate-expiration/...,port-listener/...}` | Targeted health probes.                                                            |
| ◻︎      | GET/PUT | `/cluster-name`                                                              | Read/set the cluster name.                                                         |

### Connections, channels & consumers

| Status | Method | Path                                   | Purpose                                                          |
| ------ | ------ | -------------------------------------- | ---------------------------------------------------------------- |
| ⭐     | GET    | `/connections` · `/connections/{name}` | Who's connected (client, host, protocol, state).                 |
| ⭐     | DELETE | `/connections/{name}`                  | **Force-close a connection** (kill a runaway client).            |
| ⭐     | GET    | `/consumers` · `/consumers/{vhost}`    | Which consumers are attached to each queue (prefetch, ack mode). |
| ◻︎      | GET    | `/channels` · `/channels/{name}`       | Channel-level detail.                                            |
| ◻︎      | GET    | `/vhosts/{vhost}/connections`          | Connections scoped to a vhost.                                   |

### Topology, policies & backup

| Status | Method         | Path                                     | Purpose                                                                               |
| ------ | -------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| ⭐     | GET            | `/definitions` · `/definitions/{vhost}`  | **Export** all exchanges/queues/bindings/policies as JSON (backup/diff).              |
| ⭐     | POST           | `/definitions` · `/definitions/{vhost}`  | **Import** definitions (restore/replicate topology).                                  |
| ⭐     | GET/PUT/DELETE | `/policies/{vhost}[/{name}]`             | Manage DLX / TTL / max-length / quorum policies — directly relevant to DLQ workflows. |
| ◻︎      | GET/PUT/DELETE | `/operator-policies/{vhost}[/{name}]`    | Operator policies.                                                                    |
| ◻︎      | GET/PUT/DELETE | `/parameters/{component}/{vhost}/{name}` | Runtime parameters — e.g. **dynamic shovel** for large server-side moves.             |
| ◻︎      | GET/PUT/DELETE | `/global-parameters/{name}`              | Global parameters.                                                                    |

### Identity & access (admin surface)

| Status | Method         | Path                                                     | Purpose                                    |
| ------ | -------------- | -------------------------------------------------------- | ------------------------------------------ |
| ✅     | GET            | `/whoami`                                                | Reachability + auth probe used on connect. |
| ◻︎      | GET/PUT/DELETE | `/vhosts[/{name}]`                                       | Manage vhosts.                             |
| ◻︎      | GET/PUT/DELETE | `/users[/{name}]`                                        | Manage users.                              |
| ◻︎      | GET/PUT/DELETE | `/permissions/{vhost}/{user}` · `/topic-permissions/...` | Manage permissions.                        |
| ◻︎      | GET            | `/extensions`                                            | Installed management extensions.           |

> Full reference: any running broker serves its own at
> `http://{host}:15672/api/` (and the cli-equivalent docs at
> <https://www.rabbitmq.com/docs/management#http-api>).

---

## 3. AMQP message plane

Over `amqplib` ([`src/main/rabbitmq/amqp.ts`](../src/main/rabbitmq/amqp.ts)).
The AMQP connection is opened lazily — only when the first peek/move runs.

| Status | Operation                                                                                                   | Where                              | Purpose                                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | `connect`                                                                                                   | `amqp.ts`                          | One connection per cluster, reused.                                                                                                                       |
| ✅     | `createChannel` + `prefetch` + `consume` + `nack(requeue:true)`                                             | `message-peeker.ts`                | Non-destructive, de-duplicated peeking (head `PREFETCH_WINDOW` messages).                                                                                 |
| ✅     | `createConfirmChannel` + `get` + `publish({mandatory})` + `waitForConfirms` + `on('return')` + `ack`/`nack` | `operations.ts`                    | **Move** = drain source one-at-a-time, republish on a confirm channel, ack only after confirm; unroutable target nacks-requeues and aborts (never drops). |
| ✅     | `get`-scan by fingerprint → `ack` (delete) / republish + `ack` (move)                                       | `operations.ts` + `fingerprint.ts` | **Single-message move/delete** — pull head messages holding non-matches unacked until the fingerprint matches, act on that one, requeue the rest.         |
| ✅     | `cancel` / `close`                                                                                          | both                               | Tear down peeker channel; release held messages before purge/move.                                                                                        |
| ⭐     | `assertQueue` / `assertExchange` / `bindQueue`                                                              | —                                  | Declare topology over AMQP as an alternative to the management PUT calls.                                                                                 |
| ◻︎      | `get` loop → file                                                                                           | —                                  | One-shot **export** of a queue's messages to disk (see §4).                                                                                               |

---

## 4. Suggested additions (roadmap)

Prioritized for what this tool is _for_ — safely operating clusters, with DLQ
recovery as the marquee workflow.

### Tier 1 — directly extend the core mission

1. **Delete & create queues** — `DELETE /queues/{vhost}/{name}` (with
   `if-empty`/`if-unused`) and `PUT /queues/{vhost}/{name}`. Today we can purge
   but not delete, and can't create a move/redrive target from inside the app.
2. **Editable bindings** — `POST`/`DELETE /bindings/...` and
   `PUT /exchanges/...`. The bindings view is read-only "for now"; making it
   read-write (plus declare-exchange) is the obvious next step, and the diagram
   already visualizes the result.
3. ✅ **Richer queue detail** *(done)* — `QueueInfo` now carries memory, message /
   publish / deliver / ack rates and idle-since, surfaced in a queue-tab stats
   strip and extra overview-table columns.
4. ✅ **Live queue stats** *(done)* — each connected cluster polls `listQueues` in
   the main process and pushes the `queue-stats` StreamEvent, so the tree, overview
   and queue tabs update for **every** connection without a manual refresh.

### Tier 2 — situational awareness for operators

5. **Cluster overview & node health** — `GET /overview` + `GET /nodes` to drive a
   dashboard / richer status bar: version, total rates, and **resource alarms**
   (memory/disk) that explain a stuck `flow`-state queue.
6. **Connections & consumers, with kill** — `GET /connections` + `/consumers`
   and `DELETE /connections/{name}` to see who's draining a queue and force-close
   a misbehaving client (a common reason a DLQ won't move).
7. **Deeper health check** — replace/augment the `/whoami` ping with
   `/aliveness-test/{vhost}` or `/health/checks/alarms` for a connection
   indicator that reflects real broker health.

### Tier 3 — power features

8. **Export / import definitions** — `GET`/`POST /definitions` for topology
   backup, environment diffing, and "copy this vhost's setup to staging."
9. **Policy management** — `GET`/`PUT`/`DELETE /policies/{vhost}` to set a DLX,
   message TTL, or max-length without leaving the app — the configuration side of
   the DLQ story the move feature handles operationally.
10. **Message export to file** — an AMQP `get`-loop (or `POST .../get`) that
    saves a queue's messages to JSON/NDJSON before a destructive move or purge —
    a safety net and an audit trail.
11. **HTTP browse fallback** — `POST /queues/{vhost}/{name}/get` as a peek path
    when the AMQP port (`5672`) is firewalled but `15672` is reachable.
12. **Server-side shovel for large moves** — for very large DLQs, a dynamic
    shovel (`PUT /parameters/shovel/{vhost}/{name}`) moves messages broker-side,
    avoiding pulling every message through the app.

### Probably out of scope (note, don't build unless asked)

Full user / vhost / permission administration (`/users`, `/vhosts`,
`/permissions`) would turn Rabbit Wrangler into a general admin console and
overlaps with the official Management UI. Keep the focus on the message plane.
