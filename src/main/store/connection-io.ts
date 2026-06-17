import { dialog } from 'electron'
import { promises as fs } from 'node:fs'
import { configStore } from './config-store'
import type { ExportResult, ImportResult, SafeConnectionConfig } from '@shared/types'

/** Envelope written to disk so imports can sanity-check the file. */
const FILE_KIND = 'rabbit-wrangler-connections'
const FILE_VERSION = 1

/**
 * Write all saved connections (passwords excluded) to a user-chosen JSON file.
 * Passwords live in the OS vault and are intentionally never exported — the blob
 * wouldn't decrypt on another machine, so the user re-enters them on import.
 */
export async function exportConnections(exportedAt: string): Promise<ExportResult> {
  const connections = configStore.list()
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export Connections',
    defaultPath: 'rabbit-wrangler-connections.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  const doc = { kind: FILE_KIND, version: FILE_VERSION, exportedAt, connections }
  try {
    await fs.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf8')
    return { ok: true, path: filePath, count: connections.length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Coerce one parsed entry to a SafeConnectionConfig, dropping extras + any
 * password. Returns null when the essentials (name/host) are missing. */
function normalize(entry: unknown): SafeConnectionConfig | null {
  if (!entry || typeof entry !== 'object') return null
  const o = entry as Record<string, unknown>
  if (typeof o.name !== 'string' || !o.name.trim()) return null
  if (typeof o.host !== 'string' || !o.host.trim()) return null
  return {
    id: typeof o.id === 'string' ? o.id : '',
    name: o.name.trim(),
    host: o.host.trim(),
    amqpPort: Number(o.amqpPort) || 5672,
    managementPort: Number(o.managementPort) || 15672,
    vhost: typeof o.vhost === 'string' ? o.vhost : '/',
    username: typeof o.username === 'string' ? o.username : 'guest',
    tls: Boolean(o.tls)
  }
}

/**
 * Prompt for a JSON file and return its connections (passwords excluded) for the
 * import dialog, which lets the user set passwords + resolve name collisions.
 * Accepts either a bare array or our `{ connections: [...] }` envelope.
 */
export async function readImportFile(): Promise<ImportResult> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import Connections',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
  try {
    const raw = await fs.readFile(filePaths[0], 'utf8')
    const parsed: unknown = JSON.parse(raw)
    const arr = Array.isArray(parsed)
      ? parsed
      : (parsed as { connections?: unknown })?.connections
    if (!Array.isArray(arr)) {
      return { ok: false, error: 'File does not contain a connections array.' }
    }
    const connections = arr
      .map(normalize)
      .filter((c): c is SafeConnectionConfig => c !== null)
    if (connections.length === 0) {
      return { ok: false, error: 'No valid connections found in the file.' }
    }
    return { ok: true, connections }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
