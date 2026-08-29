import type { SaveSettingsRequest } from '../../shared/contracts'

export function buildSaveSettingsRequest(
  apiKeyInput: string,
  clearSavedApiKey: boolean,
  noteDirectory: string | null
): SaveSettingsRequest {
  const apiKey = apiKeyInput.trim()
  if (apiKey) {
    return {
      apiKey: { action: 'replace', value: apiKey },
      noteDirectory
    }
  }

  return {
    apiKey: clearSavedApiKey ? { action: 'clear' } : { action: 'keep' },
    noteDirectory
  }
}

export function clearApiKeyDraft(input: { value: string }): void {
  input.value = ''
}
