import { dialog } from 'electron'
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
    policies: len('policies')
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
    return { ok: true, path: filePath, count: s.queues + s.exchanges + s.bindings + s.policies }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Prompt for a definitions file and return a parsed summary (not yet applied). */
export async function previewDefinitionsFile(): Promise<DefinitionsPreview> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import Definitions',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
  try {
    const defs = JSON.parse(await fs.readFile(filePaths[0], 'utf8'))
    return { ok: true, path: filePaths[0], summary: summarize(defs) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Read + parse a definitions file for applying (throws on read/parse error). */
export async function readDefinitionsFile(path: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(path, 'utf8'))
}
