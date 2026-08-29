import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { PublicSettings, SaveSettingsRequest } from '../../shared/contracts'

interface PersistedSettings {
  version: 1
  encryptedApiKey?: string
  noteDirectory?: string
}

export interface SecretCodec {
  isAvailable(): boolean
  encrypt(value: string): Buffer
  decrypt(value: Buffer): string
}

export interface SettingsStoreOptions {
  filePath: string
  codec: SecretCodec
}

export class SettingsStore {
  private settings: PersistedSettings

  constructor(private readonly options: SettingsStoreOptions) {
    this.settings = loadSettings(options.filePath)
  }

  getPublicSettings(defaultNoteDirectory: string): PublicSettings {
    const noteDirectory = this.getNoteDirectory()
    return {
      hasApiKey: this.getApiKey() !== undefined,
      noteDirectory: noteDirectory ?? defaultNoteDirectory,
      defaultNoteDirectory,
      isDefaultNoteDirectory: noteDirectory === undefined
    }
  }

  getApiKey(): string | undefined {
    const encryptedApiKey = this.settings.encryptedApiKey
    if (!encryptedApiKey || !this.options.codec.isAvailable()) return undefined

    try {
      const value = this.options.codec.decrypt(Buffer.from(encryptedApiKey, 'base64')).trim()
      return value || undefined
    } catch {
      return undefined
    }
  }

  getNoteDirectory(): string | undefined {
    return this.settings.noteDirectory
  }

  save(request: SaveSettingsRequest): void {
    const next: PersistedSettings = { ...this.settings }

    if (request.noteDirectory === null) {
      delete next.noteDirectory
    } else {
      const directoryInput = request.noteDirectory.trim()
      if (!directoryInput) {
        throw new Error('笔记保存位置不是有效的文件夹')
      }
      const noteDirectory = resolve(directoryInput)
      if (!isDirectory(noteDirectory)) {
        throw new Error('笔记保存位置不是有效的文件夹')
      }
      next.noteDirectory = noteDirectory
    }

    switch (request.apiKey.action) {
      case 'keep':
        break
      case 'clear':
        delete next.encryptedApiKey
        break
      case 'replace': {
        const apiKey = request.apiKey.value.trim()
        if (!apiKey) throw new Error('API Key 不能为空')
        if (!this.options.codec.isAvailable()) {
          throw new Error('当前系统无法安全保存 API Key')
        }
        try {
          next.encryptedApiKey = this.options.codec.encrypt(apiKey).toString('base64')
        } catch {
          throw new Error('当前系统无法安全保存 API Key')
        }
        break
      }
    }

    persistSettings(this.options.filePath, next)
    this.settings = next
  }
}

function loadSettings(filePath: string): PersistedSettings {
  if (!existsSync(filePath)) return { version: 1 }

  try {
    const value: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    if (!value || typeof value !== 'object') return { version: 1 }
    const candidate = value as Record<string, unknown>
    if (candidate.version !== 1) return { version: 1 }

    const settings: PersistedSettings = { version: 1 }
    if (typeof candidate.encryptedApiKey === 'string' && candidate.encryptedApiKey) {
      settings.encryptedApiKey = candidate.encryptedApiKey
    }
    if (typeof candidate.noteDirectory === 'string' && candidate.noteDirectory) {
      settings.noteDirectory = candidate.noteDirectory
    }
    return settings
  } catch {
    return { version: 1 }
  }
}

function persistSettings(filePath: string, settings: PersistedSettings): void {
  const parentDirectory = dirname(filePath)
  const temporaryPath = `${filePath}.tmp`
  mkdirSync(parentDirectory, { recursive: true })

  try {
    writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    renameSync(temporaryPath, filePath)
  } catch (error) {
    rmSync(temporaryPath, { force: true })
    throw error
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
