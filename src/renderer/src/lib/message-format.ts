import type { PeekedMessage } from '@shared/types'

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
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
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
