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

function encrypt(plain: string): string {
  if (!plain) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    // Fall back to plain text only if the OS vault is unavailable (e.g. CI).
    return Buffer.from(plain, 'utf8').toString('base64')
  }
  return safeStorage.encryptString(plain).toString('base64')
}

function decrypt(blob: string): string {
  if (!blob) return ''
  const buf = Buffer.from(blob, 'base64')
  if (!safeStorage.isEncryptionAvailable()) {
    return buf.toString('utf8')
  }
  try {
    return safeStorage.decryptString(buf)
  } catch {
    return ''
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
  get(id: string): ConnectionConfig | undefined {
    const stored = store.get('connections')[id]
    if (!stored) return undefined
    const { encryptedPassword, ...rest } = stored
    return { ...rest, password: decrypt(encryptedPassword) }
  },

  save(config: ConnectionConfig): SafeConnectionConfig {
    const { password, ...rest } = config
    // An empty password on save means "keep the existing one" — the renderer never
    // receives the plaintext, so editing a connection leaves the field blank. Only
    // overwrite the stored blob when the user actually typed a new password. (A new
    // connection has no prior record, so a blank password is stored as blank.)
    const existing = store.get('connections')[config.id]
    const encryptedPassword =
      password === '' && existing?.encryptedPassword ? existing.encryptedPassword : encrypt(password)
    const stored: StoredConnection = { ...rest, encryptedPassword }
    store.set(`connections.${config.id}`, stored)
    return strip(stored)
  },

  delete(id: string): void {
    store.delete(`connections.${id}` as keyof PersistedShape)
  }
}
