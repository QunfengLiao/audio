import { describe, expect, it } from 'vitest'
import { resolveRuntimeSettings } from '../src/main/settings/runtime-settings'

describe('resolveRuntimeSettings', () => {
  it('prefers settings saved in the application over environment values', () => {
    const source = {
      getApiKey: () => 'saved-key',
      getNoteDirectory: () => '/chosen/notes'
    }

    expect(
      resolveRuntimeSettings(source, { DASHSCOPE_API_KEY: 'env-key' }, '/default/notes')
    ).toEqual({ apiKey: 'saved-key', noteDirectory: '/chosen/notes' })
  })

  it('falls back to a trimmed environment key and the default note directory', () => {
    const source = {
      getApiKey: () => undefined,
      getNoteDirectory: () => undefined
    }

    expect(
      resolveRuntimeSettings(source, { DASHSCOPE_API_KEY: '  env-key  ' }, '/default/notes')
    ).toEqual({ apiKey: 'env-key', noteDirectory: '/default/notes' })
  })

  it('treats the example placeholder key as missing', () => {
    const source = {
      getApiKey: () => undefined,
      getNoteDirectory: () => undefined
    }

    expect(
      resolveRuntimeSettings(source, { DASHSCOPE_API_KEY: 'sk-your-api-key' }, '/default/notes')
    ).toEqual({ apiKey: undefined, noteDirectory: '/default/notes' })
  })

  it('uses a saved key even when no environment object is provided', () => {
    const source = {
      getApiKey: () => 'saved-key',
      getNoteDirectory: () => undefined
    }

    expect(resolveRuntimeSettings(source, {}, '/default/notes')).toEqual({
      apiKey: 'saved-key',
      noteDirectory: '/default/notes'
    })
  })
})
