// Drain (consume + discard) messages from the sample queues — the mirror of
// seed-broker.mjs. Useful for resetting queue depths, testing the empty state, or
// as an alternative to purge. Pure Node; uses amqplib. Only touches queues under
// the prefix (default "rw.demo") unless you pass an explicit --queue.
//
//   node scripts/drain-broker.mjs                 # empty every rw.demo.* queue
//   node scripts/drain-broker.mjs --queue rw.demo.audit   # just one
//   node scripts/drain-broker.mjs --count 100     # at most 100 per queue
//   node scripts/drain-broker.mjs --print         # log each message before discard
//
// Flags: --url, --prefix, --queue <name>, --count <n>, --print, --help.
import amqp from 'amqplib'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--print') out.print = true
    else if (a === '--help' || a === '-h') out.help = true
    else if (a === '--count' || a === '-n') out.count = Number(argv[++i])
    else if (a === '--queue' || a === '-q') out.queue = argv[++i]
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
const LIMIT = Number.isFinite(args.count) && args.count > 0 ? Math.floor(args.count) : Infinity

if (args.help) {
  console.log(
    [
      'Drain (consume + discard) messages from the sample queues.',
      '',
      'Usage: node scripts/drain-broker.mjs [options]',
      '  --queue, -q <name>  drain only this queue (default: all <prefix>.* queues)',
      '  --count, -n <n>     drain at most n messages per queue (default: all)',
      '  --print             print a one-line summary of each message before discarding',
      '  --url <amqp-url>    broker URL (default $RABBIT_URL or guest@localhost)',
      '  --prefix <name>     queue namespace to drain (default "rw.demo")',
      '  --help, -h          this help'
    ].join('\n')
  )
  process.exit(0)
}

// Same topology as the seeder, so "drain all" matches "seed all".
const TARGETS = args.queue
  ? [args.queue]
  : [
      `${PREFIX}.orders`,
      `${PREFIX}.payments`,
      `${PREFIX}.notifications`,
      `${PREFIX}.audit`,
      `${PREFIX}.orders.dlq`,
      `${PREFIX}.payments.dlq`,
      `${PREFIX}.stress`
    ]

/** Drain one queue on its OWN channel — a get() on a missing queue 404s and
 * closes the channel, so isolating each queue keeps the rest working. */
async function drainQueue(conn, name) {
  const ch = await conn.createChannel()
  ch.on('error', () => {}) // swallow the 404 channel error for a missing queue
  let n = 0
  try {
    while (n < LIMIT) {
      const msg = await ch.get(name, { noAck: true })
      if (!msg) break
      if (args.print) {
        const ct = msg.properties.contentType ?? 'application/octet-stream'
        const preview = ct.startsWith('application/octet-stream')
          ? `<${msg.content.length} bytes>`
          : msg.content.toString('utf8').replace(/\s+/g, ' ').slice(0, 80)
        console.log(`  [${name}] ${msg.fields.routingKey} ${ct} ${preview}`)
      }
      n++
    }
  } catch {
    return -1 // queue doesn't exist (or channel closed) — skip it
  }
  await ch.close().catch(() => {})
  return n
}

let conn
try {
  conn = await amqp.connect(URL)
} catch (e) {
  console.error(`Could not connect to ${URL}: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
}
let total = 0
for (const q of TARGETS) {
  const drained = await drainQueue(conn, q)
  if (drained < 0) continue // missing queue — skip quietly
  if (drained > 0) console.log(`Drained ${drained} from ${q}`)
  total += Math.max(0, drained)
}
await conn.close().catch(() => {})
console.log(`Done — drained ${total} message${total === 1 ? '' : 's'}.`)
