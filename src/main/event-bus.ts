import { EventEmitter } from 'node:events'
import type { StreamEvent } from '@shared/ipc'

/**
 * Process-wide bus for anything that should reach the renderer over the live
 * WebSocket. The connection manager, peeker and operations all `emit` here; the
 * WebSocket server is the sole subscriber and fans events out to clients.
 */
class EventBus extends EventEmitter {
  emitStream(event: StreamEvent): void {
    this.emit('stream', event)
  }

  onStream(listener: (event: StreamEvent) => void): () => void {
    this.on('stream', listener)
    return () => this.off('stream', listener)
  }
}

export const eventBus = new EventBus()
