import type { ElectronAPI } from '@electron-toolkit/preload'
import type { RabbitApi } from '@shared/ipc'

declare global {
  interface Window {
    electron: ElectronAPI
    api: RabbitApi
  }
}

export {}
