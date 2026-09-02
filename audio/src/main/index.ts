import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  ipcMain,
  safeStorage,
  session,
  shell,
  type OpenDialogOptions
} from 'electron'
import { IPC_CHANNELS, type SessionEvent, type StartSessionRequest } from '../shared/contracts'
import {
  isSupportedRuntimePlatform,
  normalizeRuntimePlatform
} from '../shared/runtime-platform'
import { writeTranscriptToClipboard } from './clipboard-writer'
import { resolveDefaultNoteDirectory } from './default-note-directory'
import { registerSettingsIpc } from './settings/settings-ipc'
import { resolveRuntimeSettings } from './settings/runtime-settings'
import { SettingsStore } from './settings/settings-store'
import { TranscriptionSession } from './transcription-session'

if (!app.isPackaged) {
  loadEnv({ path: resolve(process.cwd(), '.env') })
}

// Electron 39+ otherwise uses CoreAudio Tap, whose Info.plist permission key is
// unavailable when the app is launched through a development terminal. The
// official fallback uses macOS Screen & System Audio Recording permission.
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('disable-features', 'MacCatapLoopbackAudioForScreenShare')
}

const remoteDebuggingPort = process.env.ELECTRON_REMOTE_DEBUGGING_PORT?.trim()
if (remoteDebuggingPort && /^\d+$/.test(remoteDebuggingPort)) {
  app.commandLine.appendSwitch('remote-debugging-port', remoteDebuggingPort)
}

let mainWindow: BrowserWindow | null = null
let activeSession: TranscriptionSession | undefined

function emit(event: SessionEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.event, event)
  }
}

function setupDisplayCapture(): void {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    if (!isSupportedRuntimePlatform(normalizeRuntimePlatform(process.platform))) {
      callback({})
      return
    }

    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 }
      })
      const primaryScreen = sources[0]
      if (!primaryScreen) {
        callback({})
        return
      }
      callback({ video: primaryScreen, audio: 'loopback' })
    } catch {
      callback({})
    }
  })
}

function setupIpc(settingsStore: SettingsStore, defaultNoteDirectory: string): void {
  registerSettingsIpc({
    registrar: {
      handle(channel, handler) {
        ipcMain.handle(channel, (event, ...args) => handler(event, ...args))
      }
    },
    store: settingsStore,
    defaultNoteDirectory,
    isSessionActive: () => activeSession !== undefined,
    chooseNoteDirectory: async (currentPath) => {
      const options: OpenDialogOptions = {
        title: '选择笔记保存文件夹',
        defaultPath: currentPath,
        buttonLabel: '选择此文件夹',
        properties: ['openDirectory', 'createDirectory']
      }
      const result =
        mainWindow && !mainWindow.isDestroyed()
          ? await dialog.showOpenDialog(mainWindow, options)
          : await dialog.showOpenDialog(options)
      return result.canceled ? null : (result.filePaths[0] ?? null)
    }
  })

  ipcMain.handle(IPC_CHANNELS.start, async (_event, request: StartSessionRequest) => {
    if (activeSession) {
      throw new Error('已有一个转写任务正在运行')
    }

    const runtimeSettings = resolveRuntimeSettings(
      settingsStore,
      { DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY },
      defaultNoteDirectory
    )
    if (!runtimeSettings.apiKey) {
      throw new Error('未配置 API Key，请打开右上角“设置”后填写')
    }

    const transcriptionSession = new TranscriptionSession({
      apiKey: runtimeSettings.apiKey,
      workspaceId: process.env.DASHSCOPE_WORKSPACE_ID,
      endpointOverride: process.env.DASHSCOPE_WS_URL,
      model: process.env.DASHSCOPE_ASR_MODEL,
      outputDirectory: runtimeSettings.noteDirectory,
      emit,
      onClosed: (closedSession) => {
        if (activeSession === closedSession) activeSession = undefined
      }
    })
    activeSession = transcriptionSession

    const notePath = await transcriptionSession.start(request.title)
    return { notePath }
  })

  ipcMain.on(IPC_CHANNELS.audio, (_event, value: unknown) => {
    const chunk = toUint8Array(value)
    if (chunk) activeSession?.appendAudio(chunk)
  })

  ipcMain.handle(IPC_CHANNELS.stop, async () => {
    await activeSession?.stop()
  })

  ipcMain.handle(IPC_CHANNELS.reveal, async (_event, notePath: string) => {
    shell.showItemInFolder(notePath)
  })

  ipcMain.handle(IPC_CHANNELS.copy, (_event, value: unknown) => {
    writeTranscriptToClipboard(value, (text) => clipboard.writeText(text))
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 940,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    title: '课迹 · 网课实时笔记',
    backgroundColor: '#f5f3ee',
    webPreferences: {
      preload: resolve(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(resolve(import.meta.dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    activeSession?.dispose()
    mainWindow = null
  })
}

app.whenReady().then(() => {
  const defaultNoteDirectory = resolveDefaultNoteDirectory({
    isPackaged: app.isPackaged,
    workingDirectory: process.cwd(),
    documentsDirectory: app.getPath('documents')
  })
  const settingsStore = new SettingsStore({
    filePath: resolve(app.getPath('userData'), 'settings.json'),
    codec: {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value)
    }
  })
  setupDisplayCapture()
  setupIpc(settingsStore, defaultNoteDirectory)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  activeSession?.dispose()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  activeSession?.dispose()
})

function toUint8Array(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return Uint8Array.from(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
  }
  return undefined
}
