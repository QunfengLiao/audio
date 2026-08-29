export interface RuntimeSettingsSource {
  getApiKey(): string | undefined
  getNoteDirectory(): string | undefined
}

export interface RuntimeEnvironment {
  DASHSCOPE_API_KEY?: string
}

export interface RuntimeSettings {
  apiKey: string | undefined
  noteDirectory: string
}

export function resolveRuntimeSettings(
  source: RuntimeSettingsSource,
  environment: RuntimeEnvironment,
  defaultNoteDirectory: string
): RuntimeSettings {
  const savedApiKey = source.getApiKey()?.trim()
  const environmentApiKey = environment.DASHSCOPE_API_KEY?.trim()
  const fallbackApiKey =
    environmentApiKey && environmentApiKey !== 'sk-your-api-key' ? environmentApiKey : undefined

  return {
    apiKey: savedApiKey || fallbackApiKey,
    noteDirectory: source.getNoteDirectory() ?? defaultNoteDirectory
  }
}
