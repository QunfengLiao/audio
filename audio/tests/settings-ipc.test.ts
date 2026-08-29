import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, type PublicSettings, type SaveSettingsRequest } from '../src/shared/contracts'
import {
  registerSettingsIpc,
  type SettingsIpcHandler,
  type SettingsIpcRegistrar
} from '../src/main/settings/settings-ipc'

describe('registerSettingsIpc', () => {
  it('returns only public settings state', async () => {
    const harness = createHarness()

    const result = await harness.invoke(IPC_CHANNELS.settingsGet)

    expect(result).toEqual(harness.publicSettings)
    expect(result).not.toHaveProperty('apiKey')
    expect(result).not.toHaveProperty('encryptedApiKey')
  })

  it('saves settings and returns their updated public state', async () => {
    const harness = createHarness()
    const request: SaveSettingsRequest = {
      apiKey: { action: 'replace', value: 'sk-new' },
      noteDirectory: '/chosen/notes'
    }

    const result = await harness.invoke(IPC_CHANNELS.settingsSave, request)

    expect(harness.savedRequests).toEqual([request])
    expect(result).toEqual(harness.publicSettings)
  })

  it('rejects saving settings while a transcription session is active', async () => {
    const harness = createHarness({ sessionActive: true })

    await expect(
      harness.invoke(IPC_CHANNELS.settingsSave, {
        apiKey: { action: 'keep' },
        noteDirectory: null
      })
    ).rejects.toThrow('转写进行中不能修改设置')
    expect(harness.savedRequests).toHaveLength(0)
  })

  it('rejects a malformed settings request', async () => {
    const harness = createHarness()

    await expect(
      harness.invoke(IPC_CHANNELS.settingsSave, {
        apiKey: { action: 'replace', value: 42 },
        noteDirectory: null
      })
    ).rejects.toThrow('设置内容无效')
  })

  it('rejects an empty custom note directory', async () => {
    const harness = createHarness()

    await expect(
      harness.invoke(IPC_CHANNELS.settingsSave, {
        apiKey: { action: 'keep' },
        noteDirectory: '   '
      })
    ).rejects.toThrow('设置内容无效')
  })

  it('delegates directory selection using the current path', async () => {
    const harness = createHarness({ chosenDirectory: '/new/notes' })

    const result = await harness.invoke(
      IPC_CHANNELS.settingsChooseNoteDirectory,
      '/current/notes'
    )

    expect(harness.directoryPrompts).toEqual(['/current/notes'])
    expect(result).toBe('/new/notes')
  })
})

function createHarness(options: {
  sessionActive?: boolean
  chosenDirectory?: string | null
} = {}): {
  publicSettings: PublicSettings
  savedRequests: SaveSettingsRequest[]
  directoryPrompts: string[]
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
} {
  const handlers = new Map<string, SettingsIpcHandler>()
  const registrar: SettingsIpcRegistrar = {
    handle: (channel, handler) => handlers.set(channel, handler)
  }
  const publicSettings: PublicSettings = {
    hasApiKey: true,
    noteDirectory: '/default/notes',
    defaultNoteDirectory: '/default/notes',
    isDefaultNoteDirectory: true
  }
  const savedRequests: SaveSettingsRequest[] = []
  const directoryPrompts: string[] = []

  registerSettingsIpc({
    registrar,
    store: {
      getPublicSettings: () => publicSettings,
      save: (request) => savedRequests.push(request)
    },
    defaultNoteDirectory: '/default/notes',
    isSessionActive: () => options.sessionActive ?? false,
    chooseNoteDirectory: async (currentPath) => {
      directoryPrompts.push(currentPath)
      return options.chosenDirectory ?? null
    }
  })

  return {
    publicSettings,
    savedRequests,
    directoryPrompts,
    async invoke(channel, ...args) {
      const handler = handlers.get(channel)
      if (!handler) throw new Error(`Missing handler: ${channel}`)
      return handler({}, ...args)
    }
  }
}
