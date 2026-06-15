import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { configStore } from './store/config-store'
import { connectionManager } from './connections/connection-manager'
import { eventStreamServer } from './websocket-server'
import type {
  ConnectionConfig,
  MoveMessagesRequest,
  PublishMessageRequest
} from '@shared/types'

/**
 * Registers every `invoke` handler from the IPC contract. Each handler is a thin
 * adapter: validate/route to the connection manager or config store and return a
 * serializable result. High-frequency data does NOT flow through here — it goes
 * over the WebSocket event stream (see websocket-server).
 */
export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.listConnections, () => configStore.list())

  ipcMain.handle(IPC.saveConnection, (_e, config: ConnectionConfig) =>
    configStore.save(config)
  )

  ipcMain.handle(IPC.deleteConnection, async (_e, id: string) => {
    await connectionManager.disconnect(id)
    configStore.delete(id)
  })

  ipcMain.handle(IPC.connect, (_e, id: string) => connectionManager.connect(id))
  ipcMain.handle(IPC.disconnect, (_e, id: string) => connectionManager.disconnect(id))

  ipcMain.handle(IPC.listQueues, (_e, connectionId: string) =>
    connectionManager.require(connectionId).listQueues()
  )

  ipcMain.handle(IPC.purgeQueue, (_e, connectionId: string, queue: string) =>
    connectionManager.require(connectionId).purgeQueue(queue)
  )

  ipcMain.handle(IPC.startPeek, (_e, connectionId: string, queue: string) =>
    connectionManager.require(connectionId).startPeek(queue)
  )

  ipcMain.handle(IPC.stopPeek, (_e, connectionId: string, queue: string) =>
    connectionManager.require(connectionId).stopPeek(queue)
  )

  ipcMain.handle(IPC.moveMessages, (_e, req: MoveMessagesRequest) =>
    connectionManager.require(req.connectionId).moveMessages(req)
  )

  ipcMain.handle(IPC.listExchanges, (_e, connectionId: string) =>
    connectionManager.require(connectionId).listExchanges()
  )

  ipcMain.handle(IPC.listExchangeBindings, (_e, connectionId: string, exchange: string) =>
    connectionManager.require(connectionId).listExchangeBindings(exchange)
  )

  ipcMain.handle(IPC.deleteExchange, (_e, connectionId: string, exchange: string) =>
    connectionManager.require(connectionId).deleteExchange(exchange)
  )

  ipcMain.handle(IPC.publishMessage, (_e, req: PublishMessageRequest) =>
    connectionManager.require(req.connectionId).publishMessage(req)
  )

  ipcMain.handle(IPC.getEventStreamPort, () => eventStreamServer.getPort())
}
