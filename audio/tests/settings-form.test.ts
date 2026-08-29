import { describe, expect, it } from 'vitest'
import {
  buildSaveSettingsRequest,
  clearApiKeyDraft
} from '../src/renderer/src/settings-form'

describe('buildSaveSettingsRequest', () => {
  it('keeps the saved key when the password field stays empty', () => {
    expect(buildSaveSettingsRequest('', false, '/notes')).toEqual({
      apiKey: { action: 'keep' },
      noteDirectory: '/notes'
    })
  })

  it('trims and replaces the key when a new value is entered', () => {
    expect(buildSaveSettingsRequest('  sk-new  ', false, '/notes')).toEqual({
      apiKey: { action: 'replace', value: 'sk-new' },
      noteDirectory: '/notes'
    })
  })

  it('clears the saved key only when explicitly requested', () => {
    expect(buildSaveSettingsRequest('', true, null)).toEqual({
      apiKey: { action: 'clear' },
      noteDirectory: null
    })
  })

  it('uses a newly entered key after an earlier clear request', () => {
    expect(buildSaveSettingsRequest('sk-replacement', true, null)).toEqual({
      apiKey: { action: 'replace', value: 'sk-replacement' },
      noteDirectory: null
    })
  })

  it('removes an unsaved API key draft when the settings dialog closes', () => {
    const input = { value: 'sk-unsaved-draft' }

    clearApiKeyDraft(input)

    expect(input.value).toBe('')
  })
})
