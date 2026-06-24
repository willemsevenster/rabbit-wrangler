import { contextBridge, ipcRenderer, clipboard } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC, type RabbitApi } from '@shared/ipc'
import type {
  ConnectionConfig,
  CreateBindingRequest,
  CreateExchangeRequest,
  CreateQueueRequest,
  DeleteBindingRequest,
  DeleteMessageRequest,
  DeleteQueueRequest,
  MoveMessageRequest,
  MoveMessagesRequest,
  PublishMessageRequest
} from '@shared/types'

/**
 * The renderer's only door into the main process. Every method maps 1:1 to an
 * IPC channel in the contract — the renderer never touches `ipcRenderer`
 * directly. The live event stream is intentionally NOT here; the renderer opens
 * the WebSocket itself using the port from `getEventStreamPort`.
 */
const api: RabbitApi = {
  listConnections: () => ipcRenderer.invoke(IPC.listConnections),
  saveConnection: (config: ConnectionConfig) => ipcRenderer.invoke(IPC.saveConnection, config),
  deleteConnection: (id: string) => ipcRenderer.invoke(IPC.deleteConnection, id),
  connect: (id: string) => ipcRenderer.invoke(IPC.connect, id),
  disconnect: (id: string) => ipcRenderer.invoke(IPC.disconnect, id),
  exportConnections: () => ipcRenderer.invoke(IPC.exportConnections),
  importConnections: () => ipcRenderer.invoke(IPC.importConnections),

  getOverview: (connectionId: string) => ipcRenderer.invoke(IPC.getOverview, connectionId),
  getNodes: (connectionId: string) => ipcRenderer.invoke(IPC.getNodes, connectionId),
  checkHealth: (connectionId: string) => ipcRenderer.invoke(IPC.checkHealth, connectionId),
  listClientConnections: (connectionId: string) =>
    ipcRenderer.invoke(IPC.listClientConnections, connectionId),
  listConsumers: (connectionId: string) => ipcRenderer.invoke(IPC.listConsumers, connectionId),
  closeClientConnection: (connectionId: string, name: string, reason?: string) =>
    ipcRenderer.invoke(IPC.closeClientConnection, connectionId, name, reason),

  listQueues: (connectionId: string) => ipcRenderer.invoke(IPC.listQueues, connectionId),
  purgeQueue: (connectionId: string, queue: string) =>
    ipcRenderer.invoke(IPC.purgeQueue, connectionId, queue),
  createQueue: (request: CreateQueueRequest) => ipcRenderer.invoke(IPC.createQueue, request),
  deleteQueue: (request: DeleteQueueRequest) => ipcRenderer.invoke(IPC.deleteQueue, request),

  startPeek: (connectionId: string, queue: string) =>
    ipcRenderer.invoke(IPC.startPeek, connectionId, queue),
  stopPeek: (connectionId: string, queue: string) =>
    ipcRenderer.invoke(IPC.stopPeek, connectionId, queue),
  moveMessages: (request: MoveMessagesRequest) => ipcRenderer.invoke(IPC.moveMessages, request),
  moveMessage: (request: MoveMessageRequest) => ipcRenderer.invoke(IPC.moveMessage, request),
  deleteMessage: (request: DeleteMessageRequest) => ipcRenderer.invoke(IPC.deleteMessage, request),

  listExchanges: (connectionId: string) => ipcRenderer.invoke(IPC.listExchanges, connectionId),
  listExchangeBindings: (connectionId: string, exchange: string) =>
    ipcRenderer.invoke(IPC.listExchangeBindings, connectionId, exchange),
  createExchange: (request: CreateExchangeRequest) =>
    ipcRenderer.invoke(IPC.createExchange, request),
  deleteExchange: (connectionId: string, exchange: string) =>
    ipcRenderer.invoke(IPC.deleteExchange, connectionId, exchange),
  publishMessage: (request: PublishMessageRequest) =>
    ipcRenderer.invoke(IPC.publishMessage, request),
  createBinding: (request: CreateBindingRequest) => ipcRenderer.invoke(IPC.createBinding, request),
  deleteBinding: (request: DeleteBindingRequest) => ipcRenderer.invoke(IPC.deleteBinding, request),

  persistTheme: (theme: 'light' | 'dark') => ipcRenderer.invoke(IPC.persistTheme, theme),

  getEventStreamPort: () => ipcRenderer.invoke(IPC.getEventStreamPort),

  quitApp: () => ipcRenderer.invoke(IPC.quitApp),

  getAppVersion: () => ipcRenderer.invoke(IPC.getAppVersion),
  checkForUpdates: () => ipcRenderer.invoke(IPC.checkForUpdates),
  downloadUpdate: () => ipcRenderer.invoke(IPC.downloadUpdate),
  quitAndInstall: () => ipcRenderer.invoke(IPC.quitAndInstall),
  getUpdatePrefs: () => ipcRenderer.invoke(IPC.getUpdatePrefs),
  setAutoDownload: (enabled: boolean) => ipcRenderer.invoke(IPC.setAutoDownload, enabled),

  copyText: (text: string) => clipboard.writeText(text)
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} else {
  // contextIsolation disabled (not recommended) — attach directly. `window` is
  // not in the node typecheck lib, hence the suppressions on this dead branch.
  // @ts-expect-error window is defined at runtime in the preload context
  window.electron = electronAPI
  // @ts-expect-error window is defined at runtime in the preload context
  window.api = api
}
