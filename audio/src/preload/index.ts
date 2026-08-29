import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type PublicSettings,
  type QwenNotesApi,
  type SaveSettingsRequest,
  type SessionEvent,
  type StartSessionRequest,
  type StartSessionResult
} from '../shared/contracts'

const api: QwenNotesApi = {
  startSession(request: StartSessionRequest): Promise<StartSessionResult> {
    return ipcRenderer.invoke(IPC_CHANNELS.start, request)
  },
  sendAudio(chunk: ArrayBuffer): void {
    ipcRenderer.send(IPC_CHANNELS.audio, chunk)
  },
  stopSession(): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.stop)
  },
  revealNote(notePath: string): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.reveal, notePath)
  },
  copyTranscript(text: string): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.copy, text)
  },
  getSettings(): Promise<PublicSettings> {
    return ipcRenderer.invoke(IPC_CHANNELS.settingsGet)
  },
  saveSettings(request: SaveSettingsRequest): Promise<PublicSettings> {
    return ipcRenderer.invoke(IPC_CHANNELS.settingsSave, request)
  },
  chooseNoteDirectory(currentPath: string): Promise<string | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.settingsChooseNoteDirectory, currentPath)
  },
  onSessionEvent(listener: (event: SessionEvent) => void): () => void {
    const wrapped = (_electronEvent: Electron.IpcRendererEvent, event: SessionEvent): void => {
      listener(event)
    }
    ipcRenderer.on(IPC_CHANNELS.event, wrapped)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.event, wrapped)
  }
}

contextBridge.exposeInMainWorld('qwenNotes', api)
