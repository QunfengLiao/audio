export const IPC_CHANNELS = {
  start: 'transcription:start',
  audio: 'transcription:audio',
  stop: 'transcription:stop',
  event: 'transcription:event',
  reveal: 'notes:reveal',
  copy: 'notes:copy',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  settingsChooseNoteDirectory: 'settings:choose-note-directory'
} as const

export interface StartSessionRequest {
  title: string
}

export interface StartSessionResult {
  notePath: string
}

export type ApiKeyChange =
  | { action: 'keep' }
  | { action: 'replace'; value: string }
  | { action: 'clear' }

export interface SaveSettingsRequest {
  apiKey: ApiKeyChange
  noteDirectory: string | null
}

export interface PublicSettings {
  hasApiKey: boolean
  noteDirectory: string
  defaultNoteDirectory: string
  isDefaultNoteDirectory: boolean
}

export type SessionPhase =
  | 'idle'
  | 'connecting'
  | 'running'
  | 'reconnecting'
  | 'stopping'
  | 'stopped'
  | 'error'

export type SessionEvent =
  | { kind: 'status'; phase: SessionPhase; message: string }
  | { kind: 'partial'; itemId: string; text: string }
  | { kind: 'final'; itemId: string; text: string }
  | { kind: 'warning'; message: string }
  | { kind: 'fatal'; message: string }
  | { kind: 'saved'; notePath: string }

export interface QwenNotesApi {
  startSession(request: StartSessionRequest): Promise<StartSessionResult>
  sendAudio(chunk: ArrayBuffer): void
  stopSession(): Promise<void>
  revealNote(notePath: string): Promise<void>
  copyTranscript(text: string): Promise<void>
  getSettings(): Promise<PublicSettings>
  saveSettings(request: SaveSettingsRequest): Promise<PublicSettings>
  chooseNoteDirectory(currentPath: string): Promise<string | null>
  onSessionEvent(listener: (event: SessionEvent) => void): () => void
}
