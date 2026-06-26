import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import {
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  getAutoDownloadUpdates,
  setAutoDownloadUpdates
} from './updater'
import { configStore } from './store/config-store'
import { exportConnections, readImportFile } from './store/connection-io'
import { saveMessagesToFile } from './store/message-io'
import {
  exportDefinitionsToFile,
  previewDefinitionsFile,
  takePendingDefinitions
} from './store/definitions-io'
import { setStoredTheme, titleBarOverlay } from './store/ui-prefs'
import { connectionManager } from './connections/connection-manager'
import { eventStreamServer } from './websocket-server'
import type {
  BrowseMode,
  ConnectionConfig,
  CreateBindingRequest,
  CreateExchangeRequest,
  CreatePolicyRequest,
  CreateQueueRequest,
  CreateShovelRequest,
  CreateUserRequest,
  CreateVhostRequest,
  DeleteBindingRequest,
  DeleteMessageRequest,
  DeleteQueueRequest,
  ExportMessagesRequest,
  MoveMessageRequest,
  MoveMessagesRequest,
  PublishMessageRequest,
  SaveMessagesRequest,
  SetPermissionRequest,
  SetTopicPermissionRequest
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

  ipcMain.handle(IPC.exportConnections, () => exportConnections(new Date().toISOString()))
  ipcMain.handle(IPC.importConnections, () => readImportFile())

  ipcMain.handle(IPC.getConnectionRuntime, (_e, connectionId: string) =>
    connectionManager.require(connectionId).runtime()
  )

  ipcMain.handle(IPC.setBrowseMode, (_e, connectionId: string, mode: BrowseMode) => {
    // Persist the preference so it survives reconnect/restart, then apply it live.
    const cfg = configStore.get(connectionId)
    if (cfg) configStore.save({ ...cfg, browseMode: mode })
    return connectionManager.require(connectionId).applyBrowseMode(mode)
  })

  ipcMain.handle(IPC.listPolicies, (_e, connectionId: string) =>
    connectionManager.require(connectionId).listPolicies()
  )

  ipcMain.handle(IPC.createPolicy, (_e, req: CreatePolicyRequest) =>
    connectionManager.require(req.connectionId).createPolicy(req)
  )

  ipcMain.handle(IPC.deletePolicy, (_e, connectionId: string, name: string) =>
    connectionManager.require(connectionId).deletePolicy(name)
  )

  ipcMain.handle(IPC.exportDefinitions, (_e, connectionId: string) => {
    const name = configStore.list().find((c) => c.id === connectionId)?.name ?? 'rabbitmq'
    return exportDefinitionsToFile(name, () =>
      connectionManager.require(connectionId).getDefinitions()
    )
  })

  ipcMain.handle(IPC.previewImportDefinitions, () => previewDefinitionsFile())

  ipcMain.handle(IPC.importDefinitions, (_e, connectionId: string, token: string) => {
    try {
      const defs = takePendingDefinitions(token)
      if (defs === undefined) {
        return { ok: false, affected: 0, error: 'Import session expired — please choose the file again.' }
      }
      return connectionManager.require(connectionId).importDefinitions(defs)
    } catch (e) {
      return { ok: false, affected: 0, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle(IPC.getCurrentUser, (_e, connectionId: string) =>
    connectionManager.require(connectionId).whoami()
  )

  ipcMain.handle(IPC.listUsers, (_e, connectionId: string) =>
    connectionManager.require(connectionId).listUsers()
  )

  ipcMain.handle(IPC.createUser, (_e, req: CreateUserRequest) =>
    connectionManager.require(req.connectionId).createUser(req)
  )

  ipcMain.handle(IPC.deleteUser, (_e, connectionId: string, name: string) =>
    connectionManager.require(connectionId).deleteUser(name)
  )

  ipcMain.handle(IPC.listVhosts, (_e, connectionId: string) =>
    connectionManager.require(connectionId).listVhosts()
  )

  ipcMain.handle(IPC.createVhost, (_e, req: CreateVhostRequest) =>
    connectionManager.require(req.connectionId).createVhost(req)
  )

  ipcMain.handle(IPC.deleteVhost, (_e, connectionId: string, name: string) =>
    connectionManager.require(connectionId).deleteVhost(name)
  )

  ipcMain.handle(IPC.listPermissions, (_e, connectionId: string) =>
    connectionManager.require(connectionId).listPermissions()
  )

  ipcMain.handle(IPC.setPermission, (_e, req: SetPermissionRequest) =>
    connectionManager.require(req.connectionId).setPermission(req)
  )

  ipcMain.handle(IPC.deletePermission, (_e, connectionId: string, vhost: string, user: string) =>
    connectionManager.require(connectionId).deletePermission(vhost, user)
  )

  ipcMain.handle(IPC.listTopicPermissions, (_e, connectionId: string) =>
    connectionManager.require(connectionId).listTopicPermissions()
  )

  ipcMain.handle(IPC.setTopicPermission, (_e, req: SetTopicPermissionRequest) =>
    connectionManager.require(req.connectionId).setTopicPermission(req)
  )

  ipcMain.handle(
    IPC.deleteTopicPermission,
    (_e, connectionId: string, vhost: string, user: string) =>
      connectionManager.require(connectionId).deleteTopicPermission(vhost, user)
  )

  ipcMain.handle(IPC.getShovelSupport, (_e, connectionId: string) =>
    connectionManager.require(connectionId).getShovelSupport()
  )

  ipcMain.handle(IPC.listShovels, (_e, connectionId: string) =>
    connectionManager.require(connectionId).listShovels()
  )

  ipcMain.handle(IPC.createShovel, (_e, req: CreateShovelRequest) =>
    connectionManager.require(req.connectionId).createShovel(req)
  )

  ipcMain.handle(IPC.deleteShovel, (_e, connectionId: string, name: string) =>
    connectionManager.require(connectionId).deleteShovel(name)
  )

  ipcMain.handle(IPC.getOverview, (_e, connectionId: string) =>
    connectionManager.require(connectionId).getOverview()
  )

  ipcMain.handle(IPC.getNodes, (_e, connectionId: string) =>
    connectionManager.require(connectionId).getNodes()
  )

  ipcMain.handle(IPC.checkHealth, (_e, connectionId: string) =>
    connectionManager.require(connectionId).checkHealth()
  )

  ipcMain.handle(IPC.listClientConnections, (_e, connectionId: string) =>
    connectionManager.require(connectionId).listClientConnections()
  )

  ipcMain.handle(IPC.listConsumers, (_e, connectionId: string) =>
    connectionManager.require(connectionId).listConsumers()
  )

  ipcMain.handle(
    IPC.closeClientConnection,
    (_e, connectionId: string, name: string, reason?: string) =>
      connectionManager
        .require(connectionId)
        .closeClientConnection(name, reason ?? 'Closed from Rabbit Wrangler')
  )

  ipcMain.handle(IPC.listQueues, (_e, connectionId: string) =>
    connectionManager.require(connectionId).listQueues()
  )

  ipcMain.handle(IPC.purgeQueue, (_e, connectionId: string, queue: string) =>
    connectionManager.require(connectionId).purgeQueue(queue)
  )

  ipcMain.handle(IPC.createQueue, (_e, req: CreateQueueRequest) =>
    connectionManager.require(req.connectionId).createQueue(req)
  )

  ipcMain.handle(IPC.deleteQueue, (_e, req: DeleteQueueRequest) =>
    connectionManager.require(req.connectionId).deleteQueue(req)
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

  ipcMain.handle(IPC.moveMessage, (_e, req: MoveMessageRequest) =>
    connectionManager.require(req.connectionId).moveMessage(req)
  )

  ipcMain.handle(IPC.deleteMessage, (_e, req: DeleteMessageRequest) =>
    connectionManager.require(req.connectionId).deleteMessage(req)
  )

  ipcMain.handle(IPC.exportMessages, (_e, req: ExportMessagesRequest) =>
    saveMessagesToFile(req.queue, () => connectionManager.require(req.connectionId).exportMessages(req))
  )

  // Save renderer-supplied records (e.g. one peeked message) — no broker needed.
  ipcMain.handle(IPC.saveMessages, (_e, req: SaveMessagesRequest) =>
    saveMessagesToFile(req.defaultName, () => Promise.resolve(req.messages))
  )

  ipcMain.handle(IPC.listExchanges, (_e, connectionId: string) =>
    connectionManager.require(connectionId).listExchanges()
  )

  ipcMain.handle(IPC.listExchangeBindings, (_e, connectionId: string, exchange: string) =>
    connectionManager.require(connectionId).listExchangeBindings(exchange)
  )

  ipcMain.handle(IPC.createExchange, (_e, req: CreateExchangeRequest) =>
    connectionManager.require(req.connectionId).createExchange(req)
  )

  ipcMain.handle(IPC.deleteExchange, (_e, connectionId: string, exchange: string) =>
    connectionManager.require(connectionId).deleteExchange(exchange)
  )

  ipcMain.handle(IPC.publishMessage, (_e, req: PublishMessageRequest) =>
    connectionManager.require(req.connectionId).publishMessage(req)
  )

  ipcMain.handle(IPC.createBinding, (_e, req: CreateBindingRequest) =>
    connectionManager.require(req.connectionId).createBinding(req)
  )

  ipcMain.handle(IPC.deleteBinding, (_e, req: DeleteBindingRequest) =>
    connectionManager.require(req.connectionId).deleteBinding(req)
  )

  ipcMain.handle(IPC.persistTheme, (_e, theme: 'light' | 'dark') => {
    setStoredTheme(theme)
    // Re-tint the native window-control overlay to match (Windows/Linux only;
    // macOS uses traffic lights and has no overlay to update).
    if (process.platform !== 'darwin') {
      const overlay = titleBarOverlay(theme)
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          win.setTitleBarOverlay(overlay)
        } catch {
          // window has no overlay (shouldn't happen on win/linux) — ignore
        }
      }
    }
  })

  ipcMain.handle(IPC.getEventStreamPort, () => eventStreamServer.getPort())

  ipcMain.handle(IPC.quitApp, () => app.quit())

  ipcMain.handle(IPC.getAppVersion, () => app.getVersion())
  ipcMain.handle(IPC.checkForUpdates, () => checkForUpdates())
  ipcMain.handle(IPC.downloadUpdate, () => downloadUpdate())
  ipcMain.handle(IPC.quitAndInstall, () => quitAndInstall())
  ipcMain.handle(IPC.getUpdatePrefs, () => ({ autoDownload: getAutoDownloadUpdates() }))
  ipcMain.handle(IPC.setAutoDownload, (_e, enabled: boolean) => setAutoDownloadUpdates(enabled))
}
