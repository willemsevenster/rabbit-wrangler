import { dialog } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import type { DefinitionsPreview, DefinitionsSummary, ExportResult } from '@shared/types'

/** Count the topology objects in a (vhost-scoped) definitions document. */
function summarize(defs: unknown): DefinitionsSummary {
  const o = (defs ?? {}) as Record<string, unknown>
  const len = (k: string): number => (Array.isArray(o[k]) ? (o[k] as unknown[]).length : 0)
  return {
    queues: len('queues'),
    exchanges: len('exchanges'),
    bindings: len('bindings'),
    policies: len('policies'),
    parameters: len('parameters')
  }
}

/**
 * Fetch the vhost definitions, then write them to a user-chosen JSON file. The
 * GET happens FIRST so a permission error (definitions need the `administrator`
 * tag) fails before bothering the user with a save dialog.
 */
export async function exportDefinitionsToFile(
  defaultName: string,
  getDefs: () => Promise<Record<string, unknown>>
): Promise<ExportResult> {
  let defs: Record<string, unknown>
  try {
    defs = await getDefs()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  const safe = defaultName.replace(/[^\w.-]+/g, '_') || 'rabbitmq'
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export Definitions',
    defaultPath: `${safe}-definitions.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  try {
    await fs.writeFile(filePath, JSON.stringify(defs, null, 2), 'utf8')
    const s = summarize(defs)
    return {
      ok: true,
      path: filePath,
      count: s.queues + s.exchanges + s.bindings + s.policies + s.parameters
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Parsed definitions from a recent preview, keyed by an opaque token. Keeping the
 * file content in main (rather than handing the path back to the renderer, which
 * would then ask main to re-read an arbitrary path) means the only file we ever
 * read is the one the user picked here via the native dialog.
 */
const pending = new Map<string, unknown>()

/** Prompt for a definitions file, parse it, hold it in main, and return a summary. */
export async function previewDefinitionsFile(): Promise<DefinitionsPreview> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import Definitions',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
  try {
    const text = await fs.readFile(filePaths[0], 'utf8')
    // Strip a leading UTF-8 BOM (charCode 0xFEFF) — some editors / exporters add
    // one, and JSON.parse chokes on it.
    const raw = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
    const defs = JSON.parse(raw)
    const token = randomUUID()
    pending.set(token, defs)
    return { ok: true, token, summary: summarize(defs) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Consume the parsed definitions for `token` (single-use). */
export function takePendingDefinitions(token: string): unknown | undefined {
  const defs = pending.get(token)
  pending.delete(token)
  return defs
}
