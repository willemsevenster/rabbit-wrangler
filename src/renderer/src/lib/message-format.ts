import type { ExportedMessage, PeekedMessage } from '@shared/types'

/** Serialize a peeked message to the file/clipboard export record shape. */
export function toExportRecord(m: PeekedMessage): ExportedMessage {
  return {
    exchange: m.exchange,
    routingKey: m.routingKey,
    redelivered: m.redelivered,
    properties: m.properties,
    headers: m.headers,
    payload: m.payload,
    payloadEncoding: m.isBinary ? 'base64' : 'string',
    fingerprint: m.fingerprint
  }
}

/** amqplib exposes properties camelCased; show the familiar RabbitMQ names, in order. */
const PROP_ORDER: [string, string][] = [
  ['contentType', 'content_type'],
  ['contentEncoding', 'content_encoding'],
  ['deliveryMode', 'delivery_mode'],
  ['priority', 'priority'],
  ['correlationId', 'correlation_id'],
  ['replyTo', 'reply_to'],
  ['expiration', 'expiration'],
  ['messageId', 'message_id'],
  ['timestamp', 'timestamp'],
  ['type', 'type'],
  ['userId', 'user_id'],
  ['appId', 'app_id'],
  ['clusterId', 'cluster_id']
]

export function formatBytes(n: number): string {
  const KB = 1024
  const MB = KB * 1024
  const GB = MB * 1024
  const TB = GB * 1024
  if (n < KB) return `${n} B`
  if (n < MB) return `${(n / KB).toFixed(1)} KB`
  if (n < GB) return `${(n / MB).toFixed(1)} MB`
  if (n < TB) return `${(n / GB).toFixed(1)} GB`
  return `${(n / TB).toFixed(1)} TB`
}

/** Format a msgs/sec rate compactly: `12/s`, `12.3/s`, `—` when absent. */
export function formatRate(n: number | undefined | null): string {
  if (n == null) return '—'
  return `${Math.round(n * 10) / 10}/s`
}

export function byteSize(m: PeekedMessage): number {
  if (m.isBinary) {
    try {
      return atob(m.payload).length
    } catch {
      return m.payload.length
    }
  }
  return new TextEncoder().encode(m.payload).length
}

export function displayValue(key: string, value: unknown): string {
  if (key === 'deliveryMode') return value === 2 ? '2 (persistent)' : `${value} (transient)`
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function propertyRows(props: Record<string, unknown>): [string, string][] {
  const rows: [string, string][] = []
  const seen = new Set<string>()
  for (const [key, label] of PROP_ORDER) {
    const v = props[key]
    if (v != null && v !== '') {
      rows.push([label, displayValue(key, v)])
      seen.add(key)
    }
  }
  for (const [key, v] of Object.entries(props)) {
    if (!seen.has(key) && v != null && v !== '') rows.push([key, displayValue(key, v)])
  }
  return rows
}

export function deathRecords(headers: Record<string, unknown>): Record<string, unknown>[] {
  const xd = headers['x-death']
  return Array.isArray(xd) ? (xd as Record<string, unknown>[]) : []
}

export function detectLanguage(m: PeekedMessage): string {
  const ct = String(m.properties.contentType ?? '').toLowerCase()
  if (ct.includes('json')) return 'json'
  if (!m.isBinary) {
    const t = m.payload.trimStart()
    if (t.startsWith('{') || t.startsWith('[')) return 'json'
  }
  return 'plaintext'
}
