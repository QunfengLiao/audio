import {
  IPC_CHANNELS,
  type PublicSettings,
  type SaveSettingsRequest
} from '../../shared/contracts'

export type SettingsIpcHandler = (
  event: unknown,
  ...args: unknown[]
) => unknown | Promise<unknown>

export interface SettingsIpcRegistrar {
  handle(channel: string, handler: SettingsIpcHandler): void
}

export interface SettingsIpcStore {
  getPublicSettings(defaultNoteDirectory: string): PublicSettings
  save(request: SaveSettingsRequest): void
}

export interface SettingsIpcOptions {
  registrar: SettingsIpcRegistrar
  store: SettingsIpcStore
  defaultNoteDirectory: string
  isSessionActive(): boolean
  chooseNoteDirectory(currentPath: string): Promise<string | null>
}

export function registerSettingsIpc(options: SettingsIpcOptions): void {
  options.registrar.handle(IPC_CHANNELS.settingsGet, () =>
    options.store.getPublicSettings(options.defaultNoteDirectory)
  )

  options.registrar.handle(IPC_CHANNELS.settingsSave, (_event, value) => {
    if (options.isSessionActive()) {
      throw new Error('转写进行中不能修改设置')
    }
    if (!isSaveSettingsRequest(value)) {
      throw new Error('设置内容无效')
    }

    options.store.save(value)
    return options.store.getPublicSettings(options.defaultNoteDirectory)
  })

  options.registrar.handle(
    IPC_CHANNELS.settingsChooseNoteDirectory,
    async (_event, currentPath) => {
      const path =
        typeof currentPath === 'string' && currentPath.trim()
          ? currentPath.trim()
          : options.defaultNoteDirectory
      return options.chooseNoteDirectory(path)
    }
  )
}

function isSaveSettingsRequest(value: unknown): value is SaveSettingsRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  if (
    request.noteDirectory !== null &&
    (typeof request.noteDirectory !== 'string' || !request.noteDirectory.trim())
  ) {
    return false
  }
  if (!request.apiKey || typeof request.apiKey !== 'object') return false

  const apiKey = request.apiKey as Record<string, unknown>
  switch (apiKey.action) {
    case 'keep':
    case 'clear':
      return true
    case 'replace':
      return typeof apiKey.value === 'string'
    default:
      return false
  }
}
