/**
 * Dead-letter-queue detection, renderer-side so the configured suffix list (a
 * user setting) applies instantly without a broker round-trip. A queue is treated
 * as a DLQ when its name ends with any of the configured suffixes (case-insensitive).
 */

/** Default DLQ name suffixes (user-customizable in Settings). */
export const DEFAULT_DLQ_SUFFIXES = [
  '.dlq',
  '.dead',
  '_dlq',
  'deadletter',
  '_error',
  '_skipped'
] as const

/** True when `name` ends with any configured suffix (case-insensitive). */
export function isDeadLetterQueue(name: string, suffixes: readonly string[]): boolean {
  const lower = name.toLowerCase()
  return suffixes.some((s) => s && lower.endsWith(s.toLowerCase()))
}
