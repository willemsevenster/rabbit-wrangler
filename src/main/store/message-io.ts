import { dialog } from 'electron'
import { promises as fs } from 'node:fs'
import type { ExportResult } from '@shared/types'
import type { ExportedMessage } from '../rabbitmq/operations'

/**
 * Prompt for a destination, then serialize a queue's drained messages to it.
 * The save dialog is shown FIRST so a cancel skips the (non-destructive but not
 * free) drain. The file format follows the chosen extension: `.json` writes a
 * pretty-printed array, anything else (default `.ndjson`) writes one JSON object
 * per line — greppable and stream-friendly for large queues.
 */
export async function exportMessagesToFile(
  queue: string,
  drain: () => Promise<ExportedMessage[]>
): Promise<ExportResult> {
  const safeName = queue.replace(/[^\w.-]+/g, '_') || 'queue'
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: `Export messages from "${queue}"`,
    defaultPath: `${safeName}.ndjson`,
    filters: [
      { name: 'NDJSON (one message per line)', extensions: ['ndjson'] },
      { name: 'JSON array', extensions: ['json'] }
    ]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }

  try {
    const messages = await drain()
    const asJson = filePath.toLowerCase().endsWith('.json')
    const body = asJson
      ? JSON.stringify(messages, null, 2)
      : messages.map((m) => JSON.stringify(m)).join('\n') + (messages.length ? '\n' : '')
    await fs.writeFile(filePath, body, 'utf8')
    return { ok: true, path: filePath, count: messages.length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
