import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsStore, type SecretCodec } from '../src/main/settings/settings-store'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('SettingsStore', () => {
  it('encrypts a trimmed API key and exposes only its configured state', () => {
    const { directory, filePath, codec, store } = createStore()
    const noteDirectory = join(directory, 'my-notes')
    const defaultDirectory = join(directory, 'default-notes')
    createDirectory(noteDirectory)

    store.save({
      apiKey: { action: 'replace', value: '  sk-secret-value  ' },
      noteDirectory
    })

    expect(store.getApiKey()).toBe('sk-secret-value')
    expect(store.getNoteDirectory()).toBe(noteDirectory)
    expect(store.getPublicSettings(defaultDirectory)).toEqual({
      hasApiKey: true,
      noteDirectory,
      defaultNoteDirectory: defaultDirectory,
      isDefaultNoteDirectory: false
    })
    expect(readFileSync(filePath, 'utf8')).not.toContain('sk-secret-value')

    const reloadedStore = new SettingsStore({ filePath, codec })
    expect(reloadedStore.getApiKey()).toBe('sk-secret-value')
    expect(reloadedStore.getNoteDirectory()).toBe(noteDirectory)
  })

  it('keeps an existing key while changing the note directory', () => {
    const { directory, store } = createStore()
    const firstDirectory = join(directory, 'first')
    const secondDirectory = join(directory, 'second')
    createDirectory(firstDirectory)
    createDirectory(secondDirectory)
    store.save({
      apiKey: { action: 'replace', value: 'sk-existing' },
      noteDirectory: firstDirectory
    })

    store.save({ apiKey: { action: 'keep' }, noteDirectory: secondDirectory })

    expect(store.getApiKey()).toBe('sk-existing')
    expect(store.getNoteDirectory()).toBe(secondDirectory)
  })

  it('clears the saved key and restores the default note directory', () => {
    const { directory, store } = createStore()
    const selectedDirectory = join(directory, 'selected')
    const defaultDirectory = join(directory, 'default')
    createDirectory(selectedDirectory)
    store.save({
      apiKey: { action: 'replace', value: 'sk-existing' },
      noteDirectory: selectedDirectory
    })

    store.save({ apiKey: { action: 'clear' }, noteDirectory: null })

    expect(store.getApiKey()).toBeUndefined()
    expect(store.getNoteDirectory()).toBeUndefined()
    expect(store.getPublicSettings(defaultDirectory)).toEqual({
      hasApiKey: false,
      noteDirectory: defaultDirectory,
      defaultNoteDirectory: defaultDirectory,
      isDefaultNoteDirectory: true
    })
  })

  it('rejects an empty replacement key without overwriting existing settings', () => {
    const { directory, filePath, store } = createStore()
    const noteDirectory = join(directory, 'notes')
    createDirectory(noteDirectory)
    store.save({
      apiKey: { action: 'replace', value: 'sk-existing' },
      noteDirectory
    })
    const before = readFileSync(filePath, 'utf8')

    expect(() =>
      store.save({ apiKey: { action: 'replace', value: '   ' }, noteDirectory })
    ).toThrow('API Key 不能为空')

    expect(store.getApiKey()).toBe('sk-existing')
    expect(readFileSync(filePath, 'utf8')).toBe(before)
  })

  it('rejects a path that is not an existing directory', () => {
    const { directory, store } = createStore()
    const missingDirectory = join(directory, 'missing')

    expect(() =>
      store.save({ apiKey: { action: 'keep' }, noteDirectory: missingDirectory })
    ).toThrow('笔记保存位置不是有效的文件夹')
  })

  it('rejects an empty custom directory instead of resolving it to the working directory', () => {
    const { store } = createStore()

    expect(() =>
      store.save({ apiKey: { action: 'keep' }, noteDirectory: '   ' })
    ).toThrow('笔记保存位置不是有效的文件夹')
  })

  it('does not save a key when secure encryption is unavailable', () => {
    const { directory, filePath } = createStore()
    const store = new SettingsStore({
      filePath,
      codec: {
        isAvailable: () => false,
        encrypt: () => Buffer.alloc(0),
        decrypt: () => ''
      }
    })

    expect(() =>
      store.save({ apiKey: { action: 'replace', value: 'sk-secret' }, noteDirectory: null })
    ).toThrow('当前系统无法安全保存 API Key')
    expect(existsSync(filePath)).toBe(false)
    expect(directory).toBeTruthy()
  })

  it('treats corrupted settings JSON as empty settings', () => {
    const { directory, filePath, codec } = createStore()
    writeFileSync(filePath, '{not-json', 'utf8')

    const store = new SettingsStore({ filePath, codec })

    expect(store.getApiKey()).toBeUndefined()
    expect(store.getNoteDirectory()).toBeUndefined()
    expect(store.getPublicSettings(join(directory, 'default'))).toMatchObject({
      hasApiKey: false,
      isDefaultNoteDirectory: true
    })
  })
})

function createStore(): {
  directory: string
  filePath: string
  codec: SecretCodec
  store: SettingsStore
} {
  const directory = mkdtempSync(join(tmpdir(), 'qwen-settings-test-'))
  temporaryDirectories.push(directory)
  const filePath = join(directory, 'settings.json')
  const codec: SecretCodec = {
    isAvailable: () => true,
    encrypt: (value) => Buffer.from([...value].reverse().join(''), 'utf8'),
    decrypt: (value) => [...value.toString('utf8')].reverse().join('')
  }
  return { directory, filePath, codec, store: new SettingsStore({ filePath, codec }) }
}

function createDirectory(path: string): void {
  mkdirSync(path, { recursive: true })
}
