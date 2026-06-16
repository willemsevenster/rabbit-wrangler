# Contributing to Rabbit Wrangler

Thanks for your interest in improving Rabbit Wrangler! This document covers how
to set up, the branching model, and what we expect in a pull request.

## Prerequisites

- **Node.js 20+**
- **[pnpm](https://pnpm.io/)** — this project uses pnpm, not npm/yarn.
- A **RabbitMQ** broker with the **management plugin** enabled (HTTP API on port
  `15672`) for manual testing.

## Setup

```sh
pnpm install     # also downloads the Electron binary via allow-listed build scripts
pnpm dev         # launch the app with hot-module reload
```

## Branching model (git-flow)

- **`main`** — release branch. Only updated by promoting `develop`. Protected.
- **`develop`** — integration branch and the **default** branch. PRs target this.
- **`feature/*`**, **`fix/*`**, **`docs/*`**, **`chore/*`** — cut from `develop`
  and merged back into `develop` via pull request.

```sh
git checkout develop && git pull
git checkout -b feature/my-change
# …work…
git push -u origin feature/my-change   # then open a PR into develop
```

Keep each branch/PR **single-purpose** — it makes review and rollback easier.

## Before you push

CI runs **type-check, lint and build** on every PR (see
`.github/workflows/ci.yml`). Run them locally first so the checks pass, and
format your changes:

```sh
pnpm typecheck   # main/preload (no DOM) and renderer (DOM)
pnpm lint        # ESLint (flat config)
pnpm build       # typecheck + bundle all targets
pnpm format      # Prettier — keep the diff tidy
```

## Commit messages

Use short, conventional-style prefixes — `feat:`, `fix:`, `docs:`, `chore:`,
`refactor:`, `test:` — followed by an imperative summary. Explain the _why_ in
the body when it isn't obvious.

## Pull requests

- Target **`develop`**.
- Fill in the PR template; link any related issues.
- Make sure **CI is green** and include screenshots for UI changes.
- Driving the app for manual checks (screenshots, DOM inspection) is documented
  in the `/run-rabbit-wrangler` skill (`.claude/skills/run-rabbit-wrangler/`).

## Architecture

See [CLAUDE.md](CLAUDE.md) for the design tour and [docs/API.md](docs/API.md) for
the API reference. The short version: three electron-vite targets (`main`,
`preload`, `renderer`) plus a shared `src/shared` contract, with two transports
(IPC for commands, a localhost WebSocket for the live peek stream) and two
RabbitMQ planes per cluster (Management HTTP API + AMQP).

## Reporting security issues

Please **don't** open a public issue for security problems — see
[SECURITY.md](SECURITY.md).
