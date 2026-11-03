import type { RabbitApi } from '@shared/ipc'

declare global {
  interface Window {
    api: RabbitApi
  }
}

export {}
