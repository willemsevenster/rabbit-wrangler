# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Rabbit Wrangler is an Electron desktop app for operating multiple RabbitMQ
clusters: non-destructively peeking at live messages, moving messages out of
dead-letter queues, and purging queues. Stack: electron-vite + React + Vite +
TypeScript.

## Commands

This project uses **pnpm** (not npm/yarn). Build scripts for `electron` and
`esbuild` are allow-listed in `pnpm-workspace.yaml` — pnpm blocks postinstall
scripts by default, and Electron needs its to download the binary.

```sh
pnpm install         # also downloads the Electron binary via allowed build scripts
pnpm dev             # launch app with HMR (electron-vite dev)
pnpm build           # typecheck + bundle all three targets to out/
pnpm typecheck       # both projects: typecheck:node + typecheck:web
pnpm lint            # eslint (flat config, eslint.config.mjs)
pnpm format          # prettier --write
pnpm build:win       # package installer via electron-builder (also :mac / :linux)
```

- Typecheck is split because main/preload and renderer have **different libs**:
  `typecheck:node` (`tsconfig.node.json`, no DOM lib — covers `src/main`,
  `src/preload`, `src/shared`) and `typecheck:web` (`tsconfig.web.json` — covers
  `src/renderer`, `src/shared`). `pnpm build` runs both before bundling.
- **No test runner is configured yet.** If you add tests, wire the script here.
- To launch and **drive** the app (screenshots, DOM inspection) use the
  `/run-rabbit-wrangler` skill — REPL driver at
  `.claude/skills/run-rabbit-wrangler/driver.mjs`.
- **Docs site** (`docs/`, VitePress) is an **isolated pnpm project** — its own
  `package.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml`, so VitePress's Vite 5 /
  esbuild never enters the app's tree (the app caps Vite at 7). Run it via the root
  proxy scripts: `pnpm docs:install` (first time; uses `--ignore-scripts` — esbuild's
  binary ships via its optional dep), then `pnpm docs:dev` / `docs:build` / `docs:preview`.
  ESLint ignores `docs/`. The site auto-deploys to GitHub Pages on push to `main`
  (`.github/workflows/pages.yml`); Pages source must be **GitHub Actions**. In-app
  Help links (`lib/help.ts` `openManual()`, used by the Help menu + `?` buttons on
  Settings/Search/peek) open `https://willemsevenster.github.io/rabbit-wrangler/`
  via `window.open` → the main process' `setWindowOpenHandler` → `shell.openExternal`.

## Architecture

Three electron-vite targets plus a shared contract bundled into all of them:

- `src/main/` — Electron main process (Node). Owns all RabbitMQ connections.
- `src/preload/` — context-isolated bridge exposing `window.api`.
- `src/renderer/` — React UI (Vite). Has **no** Node/broker access; everything
  goes through `window.api` or the event WebSocket.
- `src/shared/` — types + IPC contract, imported by all three (keep it free of
  Node/DOM imports).

### Two transports, deliberately split

This is the central design decision and spans `src/shared/ipc.ts`,
`src/main/ipc.ts`, `src/main/websocket-server.ts`, `src/main/event-bus.ts`, and
`src/renderer/src/lib/event-socket.ts`:

1. **IPC `invoke` = commands (request/response).** Channel names and the
   `RabbitApi` interface live in `src/shared/ipc.ts`. The renderer never touches
   `ipcRenderer` — it calls `window.api.*` (defined in `src/preload/index.ts`),
   which maps 1:1 to handlers registered in `src/main/ipc.ts`.
2. **WebSocket = the event firehose (server push).** Peeked messages arrive at
   high frequency, so they bypass IPC. Main runs a localhost `WebSocketServer`
   (`websocket-server.ts`) on an **ephemeral 127.0.0.1 port**; the renderer
   fetches that port via the `events:port` IPC call, then connects. Anything
   main wants to push is a `StreamEvent` (discriminated union in `ipc.ts`):
   producers call `eventBus.emitStream(...)`, the WS server is the sole
   subscriber and broadcasts to clients. In the renderer, `EventSocket` decodes
   frames and the zustand store's `applyStreamEvent` reducer folds them in.

### Two RabbitMQ transports per cluster

Each connected cluster (`src/main/connections/cluster-connection.ts`) owns
**both**:

- **Management HTTP API** (`rabbitmq/management-api.ts`, default port 15672) for
  the management plane: list queues, read stats, purge. Always available.
- **AMQP via `amqplib`** (`rabbitmq/amqp.ts`) for the message plane: peek and
  move. Opened lazily, only when a message operation is first requested.

When adding an operation, decide which plane it belongs to — don't reach for AMQP
when the management API already exposes it (e.g. purge is an HTTP `DELETE`).

### Key behaviors

- **Peeking is non-destructive and de-duplicated** (`rabbitmq/message-peeker.ts`):
  a dedicated channel consumes (prefetch `PREFETCH_WINDOW`) with manual ack and
  `nack(requeue: true)`, so nothing is consumed. Because the broker redelivers
  requeued messages forever, each message is surfaced to the UI **once** — keyed
  by a fingerprint (publisher `messageId`, else a hash of body + routing key +
  correlationId) — and already-seen messages are requeued on a throttle so a
  static queue doesn't spin in a hot loop. Caveats baked into the file: only the
  head `PREFETCH_WINDOW` messages are ever visible, and two payload-identical
  messages without a `messageId` collapse into one row. One peeker per
  (connection, queue), enforced by `ClusterConnection`. The peek UI
  (`MessagePeekPanel`) is a message **table**; selecting a row opens a
  resizable, persisted-height pane (`peekPaneHeight` in localStorage) with the
  message details (exchange, size, properties, headers — `x-death` broken out
  for DLQ messages) and the payload in a read-only **Monaco** editor
  (`MonacoViewer`; workers bundled via Vite `?worker`, so the renderer CSP allows
  `worker-src 'self' blob:`).
- **Tabbed editor** (`EditorArea`, store `tabs`/`activeTabId`): the right-hand
  area is a VSCode-style tab strip. Opening a queue, exchange, or connection
  overview from the tree opens (or focuses — never duplicates) a tab keyed by
  `${kind}:${connectionId}:${name}`. **Each queue tab owns its own peek buffer**
  and keeps peeking in the background even when another tab is active — switching
  tabs never stops a peeker; background tabs show an unread badge. A tab's context
  is cleared only by its in-tab **Refresh** (which clears the buffer and
  stop/start-peeks so the broker-side de-dup resets) or by closing it (`stopPeek`)
  and reopening. Because tabs can span clusters, the store keys queue/exchange
  lists by connection (`queuesByConn`/`exchangesByConn`), and the Move/Publish
  dialogs carry the target `connectionId` rather than assuming the tree's
  selection. Queue and exchange tabs are titled `{connection} - {name}` (resolved
  from the connection list when the tab is opened). **Ctrl+Tab / Ctrl+Shift+Tab**
  cycle the active tab forward/backward with wrap (`lib/use-tab-cycle.ts`, a global
  capture-phase keydown so Monaco doesn't swallow it); the focused tab strip also
  takes Left/Right/Home/End.
- **Cross-tab search** (`SearchDialog`, store `searchOpen`, **Ctrl+F** via
  `lib/use-search-hotkey.ts`): a popup that filters messages **already peeked**
  across every open queue tab — purely client-side, never queries the broker. Plain
  substring or **regex** (invalid regex shows inline, never throws) + match-case,
  over payload + routing key + exchange + stringified headers/properties (haystacks
  precomputed per message). Results are newest-first and **live** — matching peeks
  prepend as they arrive (the result list re-derives from the store's `tabs`);
  rendering is capped at 500 rows (surplus is noted, not hidden). Selecting a result
  shows the shared **`MessageDetail`** pane (extracted from `MessagePeekPanel`;
  formatting helpers in `lib/message-format.ts`) with working Move/Delete. Mounted
  before the move/confirm dialogs in `App.tsx` so those stack on top when launched
  from a search result.
- **Live queue stats are main-pushed** (`ClusterConnection.startStatsPolling`): each
  connected cluster polls `listQueues` every ~4s in the **main** process and emits
  the `queue-stats` `StreamEvent` (started on `connect()`, cleared in `dispose()`).
  The renderer **no longer polls on a timer** — `applyStreamEvent` folds each event
  into `queuesByConn`, so the tree, overview table and queue-tab stats strip update
  for **every** connected connection (not just the selected one). The purge-grace
  (`applyPurgeGrace`, shared with `refreshQueues`) is applied in the reducer so a
  just-purged queue isn't re-shown at its old count. `QueueInfo` carries richer
  optional fields (`memory`, `publishRate`/`deliverRate`/`ackRate`/`messageRate`,
  `idleSince`) mapped from the `/queues` payload at **zero extra cost**; DLQ-ness is
  still computed renderer-side (`lib/dlq.ts`).
- **Move = drain + republish with confirms** (`rabbitmq/operations.ts`, UI via
  the queue context menu → "Move Messages…"): pulls messages one at a time,
  republishes to the target exchange/routing-key on a **confirm channel**, and
  only acks the original after `waitForConfirms()`. So a crash mid-move can
  duplicate but never drop. Publishes are `mandatory` with a `return` listener —
  an unroutable target (e.g. a typo'd queue on the default exchange) nack-requeues
  the message and aborts rather than silently discarding it. Like purge, the
  source queue's peeker is stopped first so its held messages are drainable.
- **Single-message move/delete** (`operations.ts` `moveMessage`/`deleteMessage`,
  UI via the message row context menu or the detail-pane buttons): AMQP can't
  address a message by id, so each peeked message carries a **fingerprint**
  (`rabbitmq/fingerprint.ts` — the same key the peeker de-dups by). The op
  `get`s messages one at a time, holding non-matches unacked, until the
  fingerprint matches; then it acks (delete) or republishes+acks (move) that one
  and requeues the rest (the broker also requeues unacked on channel close, so
  nothing is lost). Two payload-identical messages without a `messageId` share a
  fingerprint, so the first match is acted on. The Move dialog (`moveDialog`,
  shared with bulk move) defaults to the **last destination used for that source
  queue** (`lastMoveTargets`, persisted in localStorage).
- **Create / delete queues** (`management-api.ts` `createQueue`/`deleteQueue`, UI via
  the Queues-group context menu + overview **New Queue** button, and the queue context
  menu → "Delete Queue…"): both are **management-plane** (HTTP `PUT`/`DELETE` on
  `/queues/{vhost}/{name}`), not AMQP. **Create** (`CreateQueueDialog`) sends
  `durable`/`auto_delete`/`arguments` — the arguments section reuses the Publish
  dialog's key/value/**type** rows so x-args like `x-dead-letter-exchange` (string) or
  `x-message-ttl` (number) get the right JSON type; `PUT` is idempotent (re-asserting
  identical settings is a no-op, a clash with different settings is a broker
  precondition error, surfaced). A new queue auto-binds to the default exchange by its
  name, so it's immediately a valid move/redrive target. **Delete**
  (`DeleteQueueDialog`) shows the live message/consumer counts and exposes the broker's
  **`if-empty` / `if-unused`** guards as checkboxes (a guard rejection shows inline so
  the user can adjust and retry); it removes the whole queue (unlike Purge). Like
  purge, `ClusterConnection.deleteQueue` **stops the peeker first** (our consumer would
  trip `if-unused`, and the queue is vanishing), and the store closes the queue's tab +
  refreshes on success. Delete is **always** confirmed via its own dialog (it carries
  the guard options), so it bypasses `maybeConfirm`/`confirmDestructive`.
- **Exchanges** (`management-api.ts` + `components/ExchangeDetail`/`ExchangeDiagram`):
  listed in the sidebar tree under an "Exchanges" group (queues are under a
  "Queues" group). The detail view shows bindings (management API
  `/bindings/source`) + an SVG binding diagram (exchange → destinations), a
  **Publish** dialog (management API publish; reports routed vs. unrouted), and
  **Delete** (disabled for the default exchange and `amq.*` built-ins). The
  default exchange is addressed as `amq.default` in API paths.
- **Editable bindings + declare-exchange** (`management-api.ts`
  `createExchange`/`createBinding`/`deleteBinding`, UI in `ExchangeDetail` +
  `CreateExchangeDialog`/`AddBindingDialog`, Exchanges-group menu): all
  management-plane. **Create Exchange** (`PUT /exchanges/{vhost}/{name}`, idempotent
  like `createQueue`) takes type/durable/auto_delete/internal/arguments; opens the
  new exchange's tab on success. **Add Binding** (`POST /bindings/{vhost}/e/{src}/{q|e}/{dst}`)
  binds the source exchange to a queue **or** another exchange (e2e), with an
  optional arguments section for headers-exchange matches; **remove binding** is the
  per-row trash → `DELETE /bindings/.../{propertiesKey}` (so `BindingInfo` now
  carries `propertiesKey`, mapped from the `/bindings/source` payload). Binding
  add/delete re-fetch only the affected exchange tab's bindings via
  `refreshExchangeBindings`, so the table **and** diagram update live. The default
  exchange can't be bound (its Add Binding is disabled). Binding-remove uses
  `maybeConfirm` (no data loss — just routing), unlike queue/exchange delete.
- **Connection registry**: `connection-manager.ts` is a singleton mapping
  connection id → live `ClusterConnection`. All IPC handlers route through
  `connectionManager.require(id)`. Saved configs live separately in
  `store/config-store.ts` (electron-store); only currently-connected clusters
  are in the manager.
- **Credentials**: `config-store.ts` encrypts passwords with the OS vault
  (`safeStorage`) before persisting. `list()` returns `SafeConnectionConfig`
  (no password) — only the main process ever sees plaintext via `get()`. Never
  send full `ConnectionConfig` to the renderer. On **edit** the renderer never
  receives the plaintext, so the dialog's password field starts blank;
  `configStore.save` treats a blank password as "keep existing" and only
  overwrites the stored blob when the user types a new one. Saving a connection
  (add or edit) **auto-connects** it (`connectConnection`) and focuses its overview.
- **Sidebar tree collapse** (`SideBar.tsx`): only one connection's children render
  at a time (`selectedConnectionId` + global `connectionCollapsed`/`queuesCollapsed`/
  `exchangesCollapsed`). A toolbar **Collapse All** button collapses the tree to the
  connections level; each connection row has an **expand/collapse-all** toggle
  (`expandConnection`/`collapseConnection`) for its own subtree.
- **Theming** (store `theme`, `styles/main.css`): light + dark via a
  `:root[data-theme='light']` palette layered over the dark-default CSS variables.
  The store applies `documentElement[data-theme]` at module load (no flash) and
  persists the choice at `rw.theme`; **first run follows the OS**
  (`prefers-color-scheme`). Toggle in the View menu. Monaco follows (`vs`/`vs-dark`),
  and scrollbars + the SVG binding diagram are themed too. Add new colors as
  variables (with a light override), not hardcoded hex.
- **Settings** (`SettingsDialog`, opened by the activity-bar gear or View →
  Settings): a store-driven modal (`settingsOpen`) mirroring the About/Confirm
  pattern. Surfaces theme, **max messages to show** (`maxMessages`, default 1000,
  clamp 10–9,999 — the per-tab peek-buffer cap; the `'peek'` reducer slices to it
  and `setMaxMessages` trims existing buffers), **confirm-before-destructive**
  (`confirmDestructive` → `store.maybeConfirm` wraps purge/delete; off skips the
  prompt — connection-delete stays always-confirmed), **auto-connect on launch**
  (`autoConnectOnLaunch`; `init()` connects every saved cluster), update controls
  (check + **auto-download**), and the **DLQ suffix list**. These persist in
  localStorage except auto-download, which is **main-owned** (`store/update-prefs.ts`,
  read by `initUpdater`, toggled live over the `getUpdatePrefs`/`setAutoDownload` IPC).
- **DLQ detection is renderer-side** (`lib/dlq.ts` `isDeadLetterQueue(name, suffixes)`):
  a queue is a DLQ when its name ends with any configured suffix (default `.dlq`,
  `.dead`, `_dlq`, `deadletter`, `_error`, `_skipped`; editable in Settings, stored
  at `rw.dlqSuffixes`). Consumers (`SideBar`, `QueueTable`, `queue-menu.ts`) read
  `dlqSuffixes` from the store and compute the flag live, so suffix changes re-badge
  instantly with no refresh. `QueueInfo` carries **no** `isDeadLetter` field — main
  no longer computes it.
- **Dialogs & toasts — no native `confirm`/`alert`** (`Toaster`, `ConfirmDialog`,
  `AboutDialog`): status/result messages use a generalized toast queue
  (`store.addToast` / `toasts`, auto-dismiss, info/success/error). Decisions use a
  **promise-based** `store.confirm({ title, message, confirmLabel, danger })` that
  drives a themed modal — so even non-component callers (the context-menu builders
  in `lib/queue-menu.ts` / `lib/exchange-menu.ts`) can `await` it. Don't
  reintroduce `window.confirm` / `window.alert`.
- **Connection import/export** (`src/main/store/connection-io.ts`, IPC
  `connections:export` / `connections:import`, `ImportConnectionsDialog`): export
  writes saved connections to JSON **without passwords** (the OS-vault blob won't
  decrypt elsewhere); import reads a file (bare array or `{ connections: [...] }`
  envelope), then a dialog lets the user set a password per row and resolve name
  collisions (Skip / Overwrite / Import as new with a `(n)` suffix). Imports save
  straight via `window.api.saveConnection` (bypassing the store action, so the
  batch doesn't auto-connect).
- **Window state** (`src/main/store/window-state.ts`): the main window's bounds +
  maximized/fullscreen are persisted to `window-state.json` (electron-store) and
  reapplied on launch. Geometry comes from `getNormalBounds()` (so a maximized
  window restores to a sane un-maximized size); a saved position that lands on a
  now-disconnected display is dropped so the window re-centers. Saved debounced on
  resize/move and flushed on close.
- **Auto-update** (`src/main/updater.ts`, `electron-updater` + GitHub Releases):
  `initUpdater()` (called from `index.ts` after `createWindow`) checks for updates
  ~4s after launch and every ~6h. It's a **no-op unless `app.isPackaged`** (the
  updater needs `app-update.yml`, only present in a packaged build).
  `autoInstallOnAppQuit` is **off** and `autoDownload` follows the user's
  preference (default off; the Settings toggle, persisted in `store/update-prefs.ts`):
  the user downloads via the title-bar Update button (`UpdateButton.tsx`) or
  Help → Check for updates, sees progress, and is **prompted to restart**
  (`restartToUpdate` → `confirm` → `quitAndInstall`). Status flows to the renderer
  as the `update-status` `StreamEvent` (reduced into the store's
  `updateStatus`/`updateToast`), exactly like peeks/connection-status — not via a
  new transport. Releases are built+published by `.github/workflows/release.yml`
  on a `v*` tag; see `RELEASING.md`. Windows ships an **NSIS installer**; Linux
  ships an **AppImage** (the only self-updating Linux artifact) plus **`.deb` and
  `.rpm`** manual-install packages (the Linux CI job installs `rpm` for the latter).
  Shipped unsigned for now but **signing-ready** (add `WIN_CSC_*` secrets — no code change).

## Conventions & gotchas

- **Extending the API requires touching the contract in lockstep:** add the
  channel + method to `src/shared/ipc.ts`, implement it in `src/preload/index.ts`,
  register the handler in `src/main/ipc.ts`, and implement the behavior in
  `ClusterConnection` / `ConnectionManager`. Missing any layer is a silent gap.
- **Path aliases** (`@shared/*`, `@renderer/*`) are declared in **two places** —
  `electron.vite.config.ts` (for bundling) and the tsconfigs (for typecheck).
  Update both or builds and typecheck disagree.
- **Module format**: the project is **ESM** (`"type": "module"`). Consequences:
  main uses `import.meta.dirname` (not `__dirname`), and electron-vite emits the
  preload as **`out/preload/index.mjs`** — the `BrowserWindow` `preload:` path in
  `src/main/index.ts` must use the `.mjs` extension or Electron won't find it.
  `externalizeDepsPlugin` keeps `dependencies` external for main/preload (Node
  resolves them at runtime — hence `node-linker=hoisted` in `.npmrc`); the
  renderer bundles everything.
- **Dependency version ceilings** (don't blindly `pnpm up --latest` past these —
  the chain breaks):
  - `vite` is capped at **7.x** by `electron-vite` 5 (its peer is `vite <8`).
  - `@vitejs/plugin-react` is capped at **5.x** because 6.x requires Vite 8.
  - `eslint` is capped at **9.x** because `eslint-plugin-react` (latest 7.37)
    crashes on ESLint 10 (removed context API). Revisit when that plugin ships
    ESLint 10 support.
  - `amqplib` 2.x ships its **own** types — there is no `@types/amqplib` (adding
    it back will conflict).
  - pnpm blocks dependency build scripts by default; `electron`, `esbuild`, and
    `electron-winstaller` are allow-listed in `pnpm-workspace.yaml`. A new dep
    that needs a postinstall (e.g. a native module) must be added there.
- The preload's `contextIsolation: false` fallback branch references `window`,
  which isn't in the node typecheck lib — hence the `@ts-expect-error` lines.
  That branch is dead in this app (isolation is on); don't "fix" it by removing
  the suppressions.
- **App icon**: the source of truth is `build/icon.svg`. Regenerate the raster
  with `node_modules/.bin/electron scripts/generate-icon.mjs` → `build/icon.png`
  (512×512; the script uses Electron's offscreen renderer with HW accel disabled
  to dodge `UnknownVizError`). electron-builder derives the platform `.ico`/`.icns`
  from `build/icon.png`; the dev `BrowserWindow` sets `icon` to it directly.
- **Security**: `contextIsolation` is on; `src/renderer/index.html` sets a CSP
  that only allows `connect-src` to self and `ws://127.0.0.1:*`. Widen it
  deliberately if you add outbound calls from the renderer.
