import { dialog } from 'electron'
import { promises as fs } from 'node:fs'
import type { ExportResult, ExportedMessage } from '@shared/types'

/**
 * Prompt for a destination, then serialize message records to it. The save
 * dialog is shown FIRST so a cancel skips the (non-destructive but not free)
 * `provide()` drain. The format follows the chosen extension: `.json` writes a
 * pretty-printed array, anything else (default `.ndjson`) writes one JSON object
 * per line — greppable and stream-friendly for large queues.
 *
 * `provide` is a thunk so the bulk path can drain the broker lazily (after the
 * dialog) while the single-message path just returns a record it already has.
 */
export async function saveMessagesToFile(
  defaultName: string,
  provide: () => Promise<ExportedMessage[]>
): Promise<ExportResult> {
  const safeName = defaultName.replace(/[^\w.-]+/g, '_') || 'messages'
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: `Export messages — ${defaultName}`,
    defaultPath: `${safeName}.ndjson`,
    filters: [
      { name: 'NDJSON (one message per line)', extensions: ['ndjson'] },
      { name: 'JSON array', extensions: ['json'] }
    ]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }

  try {
    const messages = await provide()
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
