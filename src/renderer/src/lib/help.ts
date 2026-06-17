/**
 * Open the online user manual in the default browser. The main process'
 * window-open handler routes `window.open` through `shell.openExternal`, so this
 * never navigates the app itself.
 */
export const HELP_BASE = 'https://willemsevenster.github.io/rabbit-wrangler/'

/** Open a manual page (a `guide/<slug>`), or the home page when omitted. */
export function openManual(page?: string): void {
  const url = page ? `${HELP_BASE}guide/${page}` : HELP_BASE
  window.open(url, '_blank', 'noopener')
}
