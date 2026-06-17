# Test rig — getting started

Rabbit Wrangler talks to a real RabbitMQ broker, so the fastest way to develop and
exercise it is a local broker with some sample data. This rig gives you a broker, a
configurable **seeder**, a **drainer**, and a one-command **seeded environment** —
all namespaced under a prefix (`rw.demo`) so nothing touches real queues.

All commands are run from the project root.

## 1. Get a broker

With Docker (recommended):

```sh
docker compose up -d            # RabbitMQ + management UI
```

- AMQP: `localhost:5672`, Management UI/API: `http://localhost:15672` (guest / guest).
- Already have a broker? Skip this and point the scripts at it with `--url` (or
  `$RABBIT_URL`).

Stop and wipe it with `docker compose down -v`.

## 2. Seed sample data

```sh
pnpm seed                       # ~60 mixed messages (alias for the script below)
node scripts/seed-broker.mjs --messages 8        # a few
node scripts/seed-broker.mjs --messages 1000     # many
node scripts/seed-broker.mjs --stress 8          # + edge-case payloads (see below)
node scripts/seed-broker.mjs --seed 42           # deterministic / reproducible
node scripts/seed-broker.mjs --rate 20           # live traffic until Ctrl-C
node scripts/seed-broker.mjs --clean             # tear it all down
```

| Flag | Meaning |
|------|---------|
| `--messages, -m <n>` | total messages for a one-shot seed (default 60) |
| `--stress <n>` | also publish `n` edge-case payloads to `rw.demo.stress` |
| `--seed <n>` | seed the RNG → byte-for-byte reproducible data |
| `--rate, -r <n>` | live mode: ~`n` msgs/sec until Ctrl-C |
| `--durable` | persist queues/messages across broker restarts |
| `--prefix <name>` | namespace for everything (default `rw.demo`) |
| `--url <amqp-url>` | broker URL (default `$RABBIT_URL` or `guest@localhost:5672`) |
| `--clean` | delete the sample topology and exit |

## 3. One command to a ready, seeded env

```sh
docker compose --profile seed up
```

Starts the broker, waits until it's healthy, runs the seeder once, and leaves the
broker running. Tune it with env vars:

```sh
SEED_MESSAGES=500 SEED_STRESS=10 docker compose --profile seed up
```

## 4. Drain / reset

Empty the queues without deleting them (mirror of the seeder; an alternative to the
app's purge):

```sh
node scripts/drain-broker.mjs                    # empty every rw.demo.* queue
node scripts/drain-broker.mjs --queue rw.demo.audit --count 50
node scripts/drain-broker.mjs --print            # log each message before discarding
```

`--clean` on the seeder removes the queues entirely; the drainer just consumes the
messages.

## 5. What gets created

A topic exchange `rw.demo.events` with bound work queues — `rw.demo.orders`
(`order.#`), `rw.demo.payments` (`payment.#`), `rw.demo.notifications` (`notify.#`),
`rw.demo.audit` (`#`, catch-all) — plus two dead-letter queues
(`rw.demo.orders.dlq`, `rw.demo.payments.dlq`) and, with `--stress`, `rw.demo.stress`.

Messages are deliberately varied to exercise the UI:

- **Bodies:** JSON (orders/payments/notifications/user events), plain-text log
  lines, occasional binary blobs.
- **Properties:** ~70% carry a `messageId` (the rest exercise the body-hash
  fingerprint), plus mixed `correlationId`, `timestamp`, `appId`, and `x-*` headers.
- **DLQ x-death is real.** RabbitMQ *strips* a client-supplied `x-death`, so the
  seeder dead-letters for real (a TTL-0 feeder queue → the `.dlq`), giving each DLQ
  message an authentic broker `x-death` for the app's DLQ detail breakout.
- **`--stress`** publishes awkward payloads: a huge array, deeply nested JSON,
  unicode/emoji/RTL, a minified multi-thousand-row object, a very long single line,
  and heavy escapes — for stress-testing the Monaco payload viewer.

## 6. Drive the app with seeded data

The `run-rabbit-wrangler` skill's driver can self-seed so an end-to-end run has data
to work with:

```
launch
seed 80
unseed   # tear down when done
```

(See `.claude/skills/run-rabbit-wrangler/SKILL.md`.)

## 7. Point the app at it

In Rabbit Wrangler, add a connection to `localhost`, AMQP port `5672`, management
port `15672`, user/pass `guest`/`guest`, then peek the `rw.demo.*` queues.

## Notes

- **Transient by default** — queues/messages vanish on a broker restart unless you
  pass `--durable`. Use `--clean` for an explicit teardown.
- **Peek shows the head window** — the app surfaces only the first slice of a queue
  (see the peeker notes in `CLAUDE.md`), so a 5000-message queue won't show every row.
- **Stats lag** — the management API samples queue depths every ~5s, so counts can
  read stale for a moment right after seeding.
