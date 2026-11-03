import { dialog } from 'electron'
import { createWriteStream, promises as fs, type WriteStream } from 'node:fs'
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
 * collected in memory, so exporting a very large queue stays flat. On failure the
 * partial file is removed.
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
  const out = createWriteStream(filePath, { encoding: 'utf8' })
  try {
    let first = true
    if (asJson) await write(out, '[')
    const count = await produce(async (record) => {
      if (asJson) {
        // Indent each record so the file reads like JSON.stringify(array, null, 2).
        const body = JSON.stringify(record, null, 2).replace(/\n/g, '\n  ')
        await write(out, `${first ? '' : ','}\n  ${body}`)
      } else {
        await write(out, JSON.stringify(record) + '\n')
      }
      first = false
    })
    if (asJson) await write(out, first ? ']' : '\n]')
    await new Promise<void>((resolve, reject) =>
      out.end((err?: Error | null) => (err ? reject(err) : resolve()))
    )
    return { ok: true, path: filePath, count }
  } catch (e) {
    out.destroy()
    await fs.rm(filePath, { force: true }).catch(() => undefined)
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Write a chunk, waiting for 'drain' when the stream's buffer is full. */
function write(out: WriteStream, chunk: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error): void => reject(err)
    out.once('error', onError)
    const flushed = out.write(chunk, () => out.off('error', onError))
    if (flushed) resolve()
    else out.once('drain', () => resolve())
  })
}
