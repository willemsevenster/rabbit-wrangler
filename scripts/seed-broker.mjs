// Seed a RabbitMQ broker with a small sample topology and randomly-populated
// messages — a test rig for exercising Rabbit Wrangler (peek, move, purge, DLQ
// breakout, keyboard nav, live unread badges). Pure Node; uses amqplib (already a
// project dependency). Everything it creates is namespaced under a prefix
// (default "rw.demo") so `--clean` can remove it without touching real queues.
//
//   node scripts/seed-broker.mjs                  # default one-shot seed (~60 msgs)
//   node scripts/seed-broker.mjs --messages 1000  # many
//   node scripts/seed-broker.mjs --messages 8     # few
//   node scripts/seed-broker.mjs --stress 8       # edge-case payloads (huge/nested/unicode)
//   node scripts/seed-broker.mjs --seed 42        # deterministic, reproducible data
//   node scripts/seed-broker.mjs --rate 5         # live: ~5 msgs/sec until Ctrl-C
//   node scripts/seed-broker.mjs --clean          # delete everything it created
//   node scripts/seed-broker.mjs --url amqp://guest:guest@host:5672 --prefix demo
//
// Flags: --url, --prefix, --messages <n>, --stress <n>, --seed <n>, --rate <n>,
//        --clean, --durable, --help.   Env fallbacks: RABBIT_URL.
import amqp from 'amqplib'
import { randomUUID, randomBytes } from 'node:crypto'

// ---------- args ----------
function parseArgs(argv) {
  const out = { messages: 60 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--clean') out.clean = true
    else if (a === '--durable') out.durable = true
    else if (a === '--help' || a === '-h') out.help = true
    else if (a === '--messages' || a === '-m') out.messages = Number(argv[++i])
    else if (a === '--stress') out.stress = Number(argv[++i])
    else if (a === '--seed') out.seed = Number(argv[++i])
    else if (a === '--rate' || a === '-r') out.rate = Number(argv[++i])
    else if (a === '--url') out.url = argv[++i]
    else if (a === '--prefix') out.prefix = argv[++i]
    else {
      console.error(`Unknown argument: ${a}`)
      out.help = true
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const URL = args.url ?? process.env.RABBIT_URL ?? 'amqp://guest:guest@localhost:5672'
const PREFIX = args.prefix ?? 'rw.demo'
const DURABLE = Boolean(args.durable)

if (args.help) {
  console.log(
    [
      'Seed a RabbitMQ broker with sample queues + messages for testing.',
      '',
      'Usage: node scripts/seed-broker.mjs [options]',
      '  --messages, -m <n>  total messages for a one-shot seed (default 60)',
      '  --stress <n>        also publish n edge-case payloads (huge/nested/unicode/…)',
      '  --seed <n>          deterministic RNG seed → reproducible data',
      '  --rate, -r <n>      live mode: publish ~n msgs/sec until Ctrl-C',
      '  --clean             delete the sample topology and exit',
      '  --durable           make the queues/exchange durable (default: transient)',
      '  --url <amqp-url>    broker URL (default $RABBIT_URL or guest@localhost)',
      '  --prefix <name>     namespace for everything created (default "rw.demo")',
      '  --help, -h          this help'
    ].join('\n')
  )
  process.exit(0)
}

// ---------- deterministic RNG (when --seed) ----------
// Default to crypto/Math.random; with --seed, use a tiny seeded PRNG so the data
// (including ids + binary bytes + timestamps) is byte-for-byte reproducible.
const SEEDED = Number.isFinite(args.seed)
const FIXED_NOW = 1_700_000_000_000
function makeRng(seed) {
  if (!SEEDED) return { next: Math.random, uuid: randomUUID, bytes: randomBytes }
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const hex = '0123456789abcdef'
  const uuid = () => {
    let o = ''
    for (let i = 0; i < 32; i++) o += hex[Math.floor(next() * 16)]
    return `${o.slice(0, 8)}-${o.slice(8, 12)}-4${o.slice(13, 16)}-a${o.slice(17, 20)}-${o.slice(20, 32)}`
  }
  const bytes = (n) => {
    const b = Buffer.alloc(n)
    for (let i = 0; i < n; i++) b[i] = Math.floor(next() * 256)
    return b
  }
  return { next, uuid, bytes }
}
const rng = makeRng(args.seed)
const nowMs = () => (SEEDED ? FIXED_NOW : Date.now())

// ---------- topology (derived from the prefix so seed + clean agree) ----------
const EXCHANGE = `${PREFIX}.events`
// Bound work queues: [name, binding key].
const WORK_QUEUES = [
  [`${PREFIX}.orders`, 'order.#'],
  [`${PREFIX}.payments`, 'payment.#'],
  [`${PREFIX}.notifications`, 'notify.#'],
  [`${PREFIX}.audit`, '#'] // catch-all — receives every routed message
]
// Dead-letter queues (name ends in .dlq so the app flags them). Populated by real
// dead-lettering (see seedDlqs) so each message carries an authentic x-death.
const DLQ_QUEUES = [`${PREFIX}.orders.dlq`, `${PREFIX}.payments.dlq`]
const STRESS_QUEUE = `${PREFIX}.stress`
const ALL_QUEUES = [...WORK_QUEUES.map(([n]) => n), ...DLQ_QUEUES, STRESS_QUEUE]
const feederFor = (dlq) => `${dlq}.src`

// ---------- random helpers ----------
const pick = (arr) => arr[Math.floor(rng.next() * arr.length)]
const randInt = (lo, hi) => lo + Math.floor(rng.next() * (hi - lo + 1))
const chance = (p) => rng.next() < p
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const FIRST = ['Ada', 'Lin', 'Sam', 'Wei', 'Noa', 'Ravi', 'Mia', 'Tom', 'Zoe', 'Ivan']
const LAST = ['Lovelace', 'Chen', 'Patel', 'Okoro', 'Schmidt', 'Garcia', 'Khan', 'Müller']
const PRODUCTS = ['Widget', 'Sprocket', 'Gizmo', 'Cog', 'Bolt', 'Flange', 'Gasket']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'ZAR', 'AUD']
const METHODS = ['card', 'eft', 'paypal', 'crypto']
const CHANNELS = ['email', 'sms', 'push', 'webhook']

/** Build one random message: { key, body (Buffer), options }. */
function makeMessage() {
  const kind = pick(['order', 'payment', 'notify', 'user', 'log', 'log', 'binary'])
  const now = nowMs()
  const baseHeaders = {
    'x-source': 'seed-broker',
    'x-schema-version': randInt(1, 3),
    'x-attempt': randInt(1, 4)
  }
  const common = {
    timestamp: now,
    appId: 'rw-seeder',
    // ~70% carry a publisher messageId; the rest exercise the body-hash fingerprint.
    ...(chance(0.7) ? { messageId: rng.uuid() } : {}),
    ...(chance(0.4) ? { correlationId: rng.uuid() } : {})
  }

  if (kind === 'binary') {
    return {
      key: `log.binary.${pick(['snapshot', 'thumbnail', 'blob'])}`,
      body: rng.bytes(randInt(24, 256)),
      options: {
        ...common,
        contentType: 'application/octet-stream',
        type: 'binary.blob',
        headers: baseHeaders
      }
    }
  }
  if (kind === 'log') {
    const levels = ['INFO', 'WARN', 'DEBUG', 'ERROR']
    const text = `${new Date(now).toISOString()} ${pick(levels)} ${pick(['cache', 'http', 'db', 'auth'])}: ${pick(['ok', 'retry', 'timeout', 'miss', 'slow query'])} (${randInt(1, 900)}ms)`
    return {
      key: `log.${pick(['app', 'sys', 'access'])}`,
      body: Buffer.from(text, 'utf8'),
      options: { ...common, contentType: 'text/plain', type: 'log.line', headers: baseHeaders }
    }
  }

  let key
  let payload
  let type
  if (kind === 'order') {
    type = 'order.created'
    key = `order.${pick(['created', 'updated', 'cancelled'])}`
    payload = {
      orderId: `ord_${randInt(10000, 99999)}`,
      customer: `${pick(FIRST)} ${pick(LAST)}`,
      items: Array.from({ length: randInt(1, 4) }, () => ({
        sku: `${pick(PRODUCTS).toUpperCase()}-${randInt(100, 999)}`,
        qty: randInt(1, 5)
      })),
      total: Number((rng.next() * 500 + 5).toFixed(2)),
      currency: pick(CURRENCIES),
      status: pick(['pending', 'paid', 'shipped'])
    }
  } else if (kind === 'payment') {
    type = 'payment.settled'
    key = `payment.${pick(['authorized', 'settled', 'refunded'])}`
    payload = {
      paymentId: `pay_${randInt(10000, 99999)}`,
      orderId: `ord_${randInt(10000, 99999)}`,
      amount: Number((rng.next() * 500 + 5).toFixed(2)),
      currency: pick(CURRENCIES),
      method: pick(METHODS),
      status: pick(['ok', 'declined', 'pending'])
    }
  } else if (kind === 'notify') {
    type = 'notification.queued'
    key = `notify.${pick(CHANNELS)}`
    payload = {
      to: `${pick(FIRST).toLowerCase()}@example.com`,
      channel: pick(CHANNELS),
      subject: pick(['Your order shipped', 'Payment received', 'Welcome!', 'Action required']),
      body: 'This is a sample notification generated by the test rig.'
    }
  } else {
    type = 'user.event'
    key = `user.${pick(['signup', 'login', 'logout', 'profile.update'])}`
    payload = {
      userId: `usr_${randInt(1000, 9999)}`,
      event: pick(['signup', 'login', 'logout']),
      ts: now,
      props: { plan: pick(['free', 'pro', 'team']), country: pick(['US', 'ZA', 'GB', 'DE']) }
    }
  }
  return {
    key,
    body: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
    options: { ...common, contentType: 'application/json', type, headers: baseHeaders }
  }
}

// ---------- stress payloads (edge cases for the Monaco viewer) ----------
function nest(depth) {
  let o = { leaf: true }
  for (let i = 0; i < depth; i++) o = { [`level_${depth - i}`]: o }
  return o
}
/** A rotating set of awkward payloads: huge, deeply nested, unicode, minified,
 * long single line, pretty, and heavy escapes. */
function stressPayload(i) {
  const cases = [
    () => ({
      name: 'large.json',
      ct: 'application/json',
      body: JSON.stringify(
        { note: 'large array', items: Array.from({ length: 5000 }, (_, k) => ({ k, name: `item-${k}`, active: k % 2 === 0 })) },
        null,
        2
      )
    }),
    () => ({ name: 'deeply-nested.json', ct: 'application/json', body: JSON.stringify(nest(40), null, 2) }),
    () => ({
      name: 'unicode.json',
      ct: 'application/json',
      body: JSON.stringify(
        { emoji: '🐰🚀✅🔥🎉', cjk: '日本語テスト · 中文测试 · 한국어', rtl: 'مرحبا بالعالم', math: '∑∫√π≠≈∞', combining: 'é à', zalgo: 'Z̸̧͕a̷l̷g̵o̶' },
        null,
        2
      )
    }),
    () => ({
      name: 'minified-huge.json',
      ct: 'application/json',
      body: JSON.stringify({ rows: Array.from({ length: 3000 }, (_, k) => ({ k, v: Math.round(rng.next() * 1e6) })) })
    }),
    () => ({ name: 'long-single-line.txt', ct: 'text/plain', body: 'lorem-ipsum-'.repeat(2000) }),
    () => ({
      name: 'escapes.json',
      ct: 'application/json',
      body: JSON.stringify({ quotes: 'He said "hi"', tab: 'a\tb', newline: 'line1\nline2', backslash: 'a\\b\\c', unicodeEscape: 'é☃' }, null, 2)
    })
  ]
  const c = cases[i % cases.length]()
  return {
    body: Buffer.from(c.body, 'utf8'),
    options: {
      timestamp: nowMs(),
      appId: 'rw-seeder',
      messageId: rng.uuid(),
      contentType: c.ct,
      type: `stress.${c.name}`,
      headers: { 'x-source': 'seed-broker', 'x-stress-case': c.name }
    }
  }
}

// ---------- broker ops ----------
async function withChannel(fn) {
  let conn
  try {
    conn = await amqp.connect(URL)
  } catch (e) {
    console.error(`Could not connect to ${URL}\n  ${e instanceof Error ? e.message : e}`)
    console.error(
      'Is a broker running? e.g. docker run -p 5672:5672 -p 15672:15672 rabbitmq:management'
    )
    process.exit(1)
  }
  const ch = await conn.createConfirmChannel()
  try {
    await fn(ch)
  } finally {
    await ch.waitForConfirms().catch(() => {})
    await ch.close().catch(() => {})
    await conn.close().catch(() => {})
  }
}

async function assertTopology(ch) {
  await ch.assertExchange(EXCHANGE, 'topic', { durable: DURABLE })
  for (const [name, key] of WORK_QUEUES) {
    await ch.assertQueue(name, { durable: DURABLE })
    await ch.bindQueue(name, EXCHANGE, key)
  }
  for (const name of DLQ_QUEUES) await ch.assertQueue(name, { durable: DURABLE })
}

/** Publish one routed message through the topic exchange. */
function publishRouted(ch) {
  const m = makeMessage()
  ch.publish(EXCHANGE, m.key, m.body, { ...m.options, persistent: DURABLE })
}

/**
 * Populate the DLQs with REAL dead-lettered messages: publish to a transient
 * feeder queue that has TTL 0 + a dead-letter route to the DLQ, so the broker
 * itself adds an authentic x-death header. (A client-supplied x-death is stripped
 * by RabbitMQ, so faking it via headers doesn't work.) Feeders are removed once
 * the broker has dead-lettered everything.
 */
async function seedDlqs(ch, total) {
  if (total <= 0) return
  const per = Math.max(1, Math.round(total / DLQ_QUEUES.length))
  for (const dlq of DLQ_QUEUES) {
    const feeder = feederFor(dlq)
    await ch.deleteQueue(feeder).catch(() => {}) // avoid arg-mismatch on a leftover
    await ch.assertQueue(feeder, {
      durable: DURABLE,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': dlq,
        'x-message-ttl': 0
      }
    })
    for (let i = 0; i < per; i++) {
      const m = makeMessage()
      ch.sendToQueue(feeder, m.body, { ...m.options, persistent: DURABLE })
    }
    await ch.waitForConfirms()
  }
  await delay(700) // let the broker finish dead-lettering before removing feeders
  for (const dlq of DLQ_QUEUES) await ch.deleteQueue(feederFor(dlq)).catch(() => {})
}

async function seedStress(ch, n) {
  if (n <= 0) return
  await ch.assertQueue(STRESS_QUEUE, { durable: DURABLE })
  for (let i = 0; i < n; i++) {
    const m = stressPayload(i)
    ch.sendToQueue(STRESS_QUEUE, m.body, { ...m.options, persistent: DURABLE })
  }
  await ch.waitForConfirms()
}

async function clean() {
  await withChannel(async (ch) => {
    for (const name of ALL_QUEUES) await ch.deleteQueue(name).catch(() => {})
    for (const dlq of DLQ_QUEUES) await ch.deleteQueue(feederFor(dlq)).catch(() => {})
    await ch.deleteExchange(EXCHANGE).catch(() => {})
  })
  console.log(`Removed sample topology under "${PREFIX}".`)
}

async function seedOnce(total, stress) {
  const dlqTotal = Math.round(total * 0.18)
  const routed = Math.max(0, total - dlqTotal)
  await withChannel(async (ch) => {
    await assertTopology(ch)
    for (let i = 0; i < routed; i++) {
      publishRouted(ch)
      if (i % 200 === 199) await ch.waitForConfirms() // flush periodically for big runs
    }
    await ch.waitForConfirms()
    await seedDlqs(ch, dlqTotal)
    await seedStress(ch, stress)
  })
  const extra = stress > 0 ? ` + ${stress} stress` : ''
  console.log(
    `Seeded ${total} messages (${routed} routed + ${dlqTotal} dead-lettered${extra})` +
      `${SEEDED ? ` [seed=${args.seed}]` : ''} into "${EXCHANGE}". Open the queues in Rabbit Wrangler.`
  )
}

async function seedLive(rate) {
  const perTick = Math.max(1, Math.round(rate / 5))
  const intervalMs = Math.round(1000 / Math.max(1, rate / perTick))
  console.log(`Live mode: ~${rate} msgs/sec into "${EXCHANGE}". Press Ctrl-C to stop.`)
  let conn
  try {
    conn = await amqp.connect(URL)
  } catch (e) {
    console.error(`Could not connect to ${URL}: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }
  const ch = await conn.createConfirmChannel()
  await assertTopology(ch)
  let sent = 0
  const timer = setInterval(() => {
    for (let i = 0; i < perTick; i++) publishRouted(ch)
    sent += perTick
    process.stdout.write(`\r  published ${sent}`)
  }, intervalMs)
  const stop = async () => {
    clearInterval(timer)
    await ch.waitForConfirms().catch(() => {})
    await ch.close().catch(() => {})
    await conn.close().catch(() => {})
    console.log(`\nStopped after ${sent} messages.`)
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

// ---------- main ----------
if (args.clean) {
  await clean()
} else if (args.rate && args.rate > 0) {
  await seedLive(args.rate)
} else {
  const total = Number.isFinite(args.messages) && args.messages >= 0 ? Math.floor(args.messages) : 60
  const stress = Number.isFinite(args.stress) && args.stress > 0 ? Math.floor(args.stress) : 0
  await seedOnce(total, stress)
}
