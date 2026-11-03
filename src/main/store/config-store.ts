import Store from 'electron-store'
import { safeStorage } from 'electron'
import type { ConnectionConfig, SafeConnectionConfig } from '@shared/types'

interface PersistedShape {
  /** Connections keyed by id. Passwords are stored encrypted (see below). */
  connections: Record<string, StoredConnection>
}

/** On-disk form: password replaced with an OS-encrypted blob (base64). */
type StoredConnection = Omit<ConnectionConfig, 'password'> & { encryptedPassword: string }

const store = new Store<PersistedShape>({
  name: 'connections',
  defaults: { connections: {} }
})

// Uses the async safeStorage API (the sync one is deprecated). It initializes
// lazily on first use after `app` is ready — every caller runs from an IPC
// handler, so that always holds. Blobs written by the old sync `encryptString`
// decrypt fine with `decryptStringAsync`, so existing files need no migration.
async function encrypt(plain: string): Promise<string> {
  if (!plain) return ''
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    // Fall back to plain text only if the OS vault is unavailable (e.g. CI).
    return Buffer.from(plain, 'utf8').toString('base64')
  }
  return (await safeStorage.encryptStringAsync(plain)).toString('base64')
}

/** `shouldReEncrypt` is set when the OS key was rotated or upgraded. */
async function decrypt(blob: string): Promise<{ plain: string; shouldReEncrypt: boolean }> {
  if (!blob) return { plain: '', shouldReEncrypt: false }
  const buf = Buffer.from(blob, 'base64')
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    return { plain: buf.toString('utf8'), shouldReEncrypt: false }
  }
  try {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(buf)
    return { plain: result, shouldReEncrypt }
  } catch {
    return { plain: '', shouldReEncrypt: false }
  }
}

function strip(c: StoredConnection): SafeConnectionConfig {
  const { encryptedPassword: _omit, ...safe } = c
  return safe
}

export const configStore = {
  list(): SafeConnectionConfig[] {
    return Object.values(store.get('connections')).map(strip)
  },

  /** Full config including the decrypted password — main-process use only. */
  async get(id: string): Promise<ConnectionConfig | undefined> {
    const stored = store.get('connections')[id]
    if (!stored) return undefined
    const { encryptedPassword, ...rest } = stored
    const { plain, shouldReEncrypt } = await decrypt(encryptedPassword)
    if (shouldReEncrypt && plain) {
      store.set(`connections.${id}.encryptedPassword`, await encrypt(plain))
    }
    return { ...rest, password: plain }
  },

  async save(config: ConnectionConfig): Promise<SafeConnectionConfig> {
    const { password, ...rest } = config
    // An empty password on save means "keep the existing one" — the renderer never
    // receives the plaintext, so editing a connection leaves the field blank. Only
    // overwrite the stored blob when the user actually typed a new password. (A new
    // connection has no prior record, so a blank password is stored as blank.)
    const existing = store.get('connections')[config.id]
    const encryptedPassword =
      password === '' && existing?.encryptedPassword
        ? existing.encryptedPassword
        : await encrypt(password)
    const stored: StoredConnection = { ...rest, encryptedPassword }
    store.set(`connections.${config.id}`, stored)
    return strip(stored)
  },

  delete(id: string): void {
    store.delete(`connections.${id}` as keyof PersistedShape)
  }
}
