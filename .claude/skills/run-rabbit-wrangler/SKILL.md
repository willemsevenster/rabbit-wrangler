---
name: run-rabbit-wrangler
description: Build, run, launch, and drive (screenshot/inspect) the Rabbit Wrangler Electron desktop app. Use when asked to run, start, launch, screenshot, smoke-test, or interact with the app's UI.
---

Rabbit Wrangler is an Electron (electron-vite + React) desktop app. A window
can't be touched headlessly, so the agent path is a **REPL driver** at
`.claude/skills/run-rabbit-wrangler/driver.mjs`: it launches the **built** app
via Playwright's Electron driver and reads one command per line on stdin
(`launch`, `ss`, `text`, `eval`, `click`, …).

All paths below are relative to the project root (`rabbit-wrangler/`). Verified
on **Windows** (PowerShell + Git bash); see Gotchas for the headless-Linux tweak.

## Prerequisites

- Node 20+ and pnpm (this repo uses pnpm — see the user's standing preference).
- `pnpm install` — also runs the allow-listed build scripts in
  `pnpm-workspace.yaml` (downloads the Electron binary) and installs
  `playwright-core`, which the driver uses.

```sh
pnpm install
```

## Build

The driver runs the compiled app in `out/`, so build first (stale `out/` shows
old UI):

```sh
pnpm build
```

## Run (agent path) — the driver

Pipe newline-separated commands into the driver. It launches, runs each command,
then exits on `quit` (or EOF).

PowerShell:

```powershell
$cmds = @"
launch
ss launch
text .titlebar__title
eval window.api.getEventStreamPort()
windows
quit
"@
$cmds | node .claude/skills/run-rabbit-wrangler/driver.mjs
```

bash:

```sh
printf 'launch\nss bash-test\ntext .titlebar__title\nquit\n' | node .claude/skills/run-rabbit-wrangler/driver.mjs
```

Expected: `launched: 🐰 Rabbit Wrangler`, a `screenshot: …` path, and
`eval window.api.getEventStreamPort()` prints a port number — that single line
proves the `.mjs` preload bridge loaded **and** the main-process WebSocket
server answered over IPC. Screenshots land in
`.claude/skills/run-rabbit-wrangler/shots/` (override with `SCREENSHOT_DIR`).

Example — drive the add-connection flow (no broker needed; cleans up after):

```powershell
$cmds = @"
launch
click-text Add Connection
fill #conn-name Local RabbitMQ Test
click-text Add
wait .tree-row
ss added
eval window.api.listConnections().then(cs=>Promise.all(cs.filter(c=>c.name==='Local RabbitMQ Test').map(c=>window.api.deleteConnection(c.id)))).then(()=>'cleaned-up')
quit
"@
$cmds | node .claude/skills/run-rabbit-wrangler/driver.mjs
```

Note: `delete`/`purge` in the UI use a native `confirm()` dialog the driver does
not auto-accept — deleting via `eval window.api.deleteConnection(id)` (as above)
avoids the blocking prompt.

### Commands

| command | what it does |
|---|---|
| `launch` | launch the built app, wait for the React shell to mount |
| `ss [name]` | screenshot → `shots/<name>.png` |
| `text [css-sel]` | print `innerText` of selector (or whole body) |
| `eval <js>` | evaluate an expression in the renderer, print JSON |
| `fill <css-sel> <value>` | set a React-controlled input's value |
| `click <css-sel>` / `click-text <text>` | click via DOM (not coordinates) |
| `type <text>` / `press <key>` | keyboard input |
| `wait <css-sel>` | wait up to 10s for a selector |
| `windows` | list open window URLs |
| `seed [n]` | populate a local broker with sample data (n msgs, default 60) so there are queues + messages to drive — see the `seed-test-broker` skill / `scripts/seed-broker.mjs` |
| `unseed` | remove the sample topology the seeder created |
| `quit` | close app and exit |

`seed`/`unseed` target a broker at `guest@localhost:5672` and let an e2e flow
self-populate before driving (e.g. `launch` → `seed 80` → connect → peek a queue
with messages). For the full test rig (volume, stress payloads, deterministic
runs, docker compose) see `docs/TESTING.md` and the `seed-test-broker` skill.

## Run (human path)

```sh
pnpm dev
```

Builds main/preload, serves the renderer at `http://localhost:5173`, and opens
the Electron window with HMR. Useful for eyeballing; useless headless. Ctrl-C to
quit.

## Gotchas

- **No broker = empty state, and that's correct.** With no saved connection the
  app shows "No saved clusters yet" + placeholders. Peek / move-DLQ / purge need
  a live RabbitMQ — e.g. `docker run -p 5672:5672 -p 15672:15672 rabbitmq:management` —
  and a connection saved via `window.api.saveConnection(...)`. Without one, the
  driver can only reach the app shell.
- **Driver runs `out/`, not the dev server.** Re-run `pnpm build` after changing
  source or you'll screenshot the old bundle.
- **Preload is `out/preload/index.mjs`** (electron-vite emits ESM preload as
  `.mjs`). `src/main/index.ts` references the `.mjs` path on purpose — if the
  bridge ever comes back undefined, that path is the first suspect. Don't
  "correct" it to `.js`.
- **Headless Linux:** prefix the `node …driver.mjs` calls with `xvfb-run -a` and
  install the usual Electron libs (`libnss3 libgbm1 libasound2 libgtk-3-0
  libxss1 libxkbcommon0`). Not verified on this machine (Windows only).

## Troubleshooting

- **`launch` hangs / `firstWindow` times out** → the main process crashed on
  boot. Re-run `pnpm build`; confirm `out/main/index.js` and
  `out/preload/index.mjs` both exist.
- **`eval window.api...` prints `null`/errors** → preload didn't load; check the
  `.mjs` preload path in `src/main/index.ts`.
- **Driver exits 1 with no screenshot** → `pnpm build` didn't produce `out/`; run
  it and read its output.
