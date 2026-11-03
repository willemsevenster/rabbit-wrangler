import { dialog } from 'electron'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { createWriteStream, promises as fs } from 'node:fs'
import type { ExportResult, ExportedMessage } from '@shared/types'

/** Pushes records into the file as they are produced; resolves the count written. */
export type MessageProducer = (sink: (record: ExportedMessage) => Promise<void>) => Promise<number>

/**
 * Prompt for a destination, then stream message records to it. The save dialog
 * is shown FIRST so a cancel skips the (non-destructive but not free) drain. The
 * format follows the chosen extension: `.json` writes a pretty-printed array,
 * anything else (default `.ndjson`) writes one JSON object per line — greppable
 * and stream-friendly for large queues.
 *
 * Records are written as `produce` yields them (with backpressure), never
 * collected in memory, so exporting a very large queue stays flat. They go to a
 * temporary sibling file that replaces the destination only once everything
 * succeeded — a failed export never truncates or deletes an existing file.
 */
export async function saveMessagesToFile(
  defaultName: string,
  produce: MessageProducer
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

  const asJson = filePath.toLowerCase().endsWith('.json')
  const tmpPath = `${filePath}.${randomBytes(4).toString('hex')}.partial`
  const out = createWriteStream(tmpPath, { encoding: 'utf8' })
  // One listener for the stream's whole lifetime (open, writes, finish): an
  // unhandled 'error' would throw in the main process. Every await below races
  // against it, so a failure surfaces through this function's result.
  const failed = new Promise<never>((_, reject) => out.on('error', reject))
  failed.catch(() => undefined) // observed via the races below

  const write = async (chunk: string): Promise<void> => {
    if (!out.write(chunk)) await Promise.race([once(out, 'drain'), failed])
  }

  try {
    let first = true
    if (asJson) await write('[')
    const count = await Promise.race([
      produce(async (record) => {
        if (asJson) {
          // Indent each record so the file reads like JSON.stringify(array, null, 2).
          const body = JSON.stringify(record, null, 2).replace(/\n/g, '\n  ')
          await write(`${first ? '' : ','}\n  ${body}`)
        } else {
          await write(JSON.stringify(record) + '\n')
        }
        first = false
      }),
      failed
    ])
    if (asJson) await write(first ? ']' : '\n]')
    out.end()
    await Promise.race([once(out, 'finish'), failed])
    await fs.rename(tmpPath, filePath)
    return { ok: true, path: filePath, count }
  } catch (e) {
    out.destroy()
    await fs.rm(tmpPath, { force: true }).catch(() => undefined)
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
