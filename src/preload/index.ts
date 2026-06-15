import { contextBridge, ipcRenderer, clipboard } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC, type RabbitApi } from '@shared/ipc'
import type {
  ConnectionConfig,
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

  listQueues: (connectionId: string) => ipcRenderer.invoke(IPC.listQueues, connectionId),
  purgeQueue: (connectionId: string, queue: string) =>
    ipcRenderer.invoke(IPC.purgeQueue, connectionId, queue),

  startPeek: (connectionId: string, queue: string) =>
    ipcRenderer.invoke(IPC.startPeek, connectionId, queue),
  stopPeek: (connectionId: string, queue: string) =>
    ipcRenderer.invoke(IPC.stopPeek, connectionId, queue),
  moveMessages: (request: MoveMessagesRequest) => ipcRenderer.invoke(IPC.moveMessages, request),

  listExchanges: (connectionId: string) => ipcRenderer.invoke(IPC.listExchanges, connectionId),
  listExchangeBindings: (connectionId: string, exchange: string) =>
    ipcRenderer.invoke(IPC.listExchangeBindings, connectionId, exchange),
  deleteExchange: (connectionId: string, exchange: string) =>
    ipcRenderer.invoke(IPC.deleteExchange, connectionId, exchange),
  publishMessage: (request: PublishMessageRequest) =>
    ipcRenderer.invoke(IPC.publishMessage, request),

  getEventStreamPort: () => ipcRenderer.invoke(IPC.getEventStreamPort),

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
