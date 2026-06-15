import { configStore } from '../store/config-store'
import { ClusterConnection } from './cluster-connection'

/**
 * Registry of every active {@link ClusterConnection}, keyed by connection id.
 * The single source of truth the IPC handlers route through. Persisted configs
 * live in {@link configStore}; this only tracks the ones currently connected.
 */
class ConnectionManager {
  private readonly active = new Map<string, ClusterConnection>()

  /** Connects (or reconnects) using the stored, decrypted config. */
  async connect(id: string): Promise<void> {
    const config = configStore.get(id)
    if (!config) throw new Error(`No saved connection with id ${id}`)

    await this.disconnect(id)
    const cluster = new ClusterConnection(config)
    this.active.set(id, cluster)
    await cluster.connect()
  }

  async disconnect(id: string): Promise<void> {
    const cluster = this.active.get(id)
    if (!cluster) return
    await cluster.dispose()
    this.active.delete(id)
  }

  /** Returns the live connection, throwing if the caller forgot to connect. */
  require(id: string): ClusterConnection {
    const cluster = this.active.get(id)
    if (!cluster) throw new Error(`Connection ${id} is not connected`)
    return cluster
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.active.values()].map((c) => c.dispose()))
    this.active.clear()
  }
}

export const connectionManager = new ConnectionManager()
