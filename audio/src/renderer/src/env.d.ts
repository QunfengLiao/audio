import type { QwenNotesApi } from '../../shared/contracts'

declare global {
  interface Window {
    qwenNotes: QwenNotesApi
  }
}

export {}
