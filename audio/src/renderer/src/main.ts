import type { PublicSettings, SessionEvent, SessionPhase } from '../../shared/contracts'
import { buildTranscriptText } from '../../shared/transcript-text'
import { SystemAudioCapture } from './audio/system-audio-capture'
import { buildSaveSettingsRequest, clearApiKeyDraft } from './settings-form'

const courseTitle = element<HTMLInputElement>('courseTitle')
const startButton = element<HTMLButtonElement>('startButton')
const stopButton = element<HTMLButtonElement>('stopButton')
const revealButton = element<HTMLButtonElement>('revealButton')
const statusBadge = element<HTMLDivElement>('statusBadge')
const statusText = element<HTMLSpanElement>('statusText')
const messageBox = element<HTMLDivElement>('messageBox')
const noteLocation = element<HTMLDivElement>('noteLocation')
const notePath = element<HTMLElement>('notePath')
const levelBar = element<HTMLDivElement>('levelBar')
const healthState = element<HTMLSpanElement>('healthState')
const silenceHint = element<HTMLSpanElement>('silenceHint')
const finalTranscript = element<HTMLDivElement>('finalTranscript')
const partialTranscript = element<HTMLParagraphElement>('partialTranscript')
const emptyState = element<HTMLDivElement>('emptyState')
const paragraphCount = element<HTMLSpanElement>('paragraphCount')
const copyAllButton = element<HTMLButtonElement>('copyAllButton')
const copyButtonLabel = element<HTMLSpanElement>('copyButtonLabel')
const settingsButton = element<HTMLButtonElement>('settingsButton')
const settingsDialog = element<HTMLDialogElement>('settingsDialog')
const settingsForm = element<HTMLFormElement>('settingsForm')
const settingsCloseButton = element<HTMLButtonElement>('settingsCloseButton')
const settingsCancelButton = element<HTMLButtonElement>('settingsCancelButton')
const settingsSaveButton = element<HTMLButtonElement>('settingsSaveButton')
const apiKeyInput = element<HTMLInputElement>('apiKeyInput')
const apiKeyStatus = element<HTMLSpanElement>('apiKeyStatus')
const clearApiKeyButton = element<HTMLButtonElement>('clearApiKeyButton')
const noteDirectoryInput = element<HTMLInputElement>('noteDirectoryInput')
const noteDirectoryMode = element<HTMLSpanElement>('noteDirectoryMode')
const chooseNoteDirectoryButton = element<HTMLButtonElement>('chooseNoteDirectoryButton')
const resetNoteDirectoryButton = element<HTMLButtonElement>('resetNoteDirectoryButton')
const settingsError = element<HTMLDivElement>('settingsError')

let capture: SystemAudioCapture | undefined
let currentNotePath = ''
let currentPartialItem = ''
let finalizedParagraphs = 0
let lastSignalAt = Date.now()
let silenceTimer: number | undefined
let stopping = false
let settingsSnapshot: PublicSettings | undefined
let selectedNoteDirectory: string | null = null
let clearSavedApiKey = false
let settingsPending = false
let choosingNoteDirectory = false
let settingsCanOpen = true
let messageTimer: number | undefined
const finalizedTranscriptParagraphs: string[] = []
let copyFeedbackTimer: number | undefined

startButton.addEventListener('click', () => void startTranscription())
stopButton.addEventListener('click', () => void stopTranscription())
revealButton.addEventListener('click', () => {
  if (currentNotePath) void window.qwenNotes.revealNote(currentNotePath)
})
copyAllButton.addEventListener('click', () => void copyAllTranscript())
settingsButton.addEventListener('click', () => void openSettings())
settingsCloseButton.addEventListener('click', closeSettings)
settingsCancelButton.addEventListener('click', closeSettings)
settingsForm.addEventListener('submit', (event) => {
  event.preventDefault()
  void saveSettings()
})
apiKeyInput.addEventListener('input', () => {
  if (apiKeyInput.value.trim()) clearSavedApiKey = false
  renderSettingsForm()
})
clearApiKeyButton.addEventListener('click', () => {
  clearSavedApiKey = !clearSavedApiKey
  apiKeyInput.value = ''
  renderSettingsForm()
})
chooseNoteDirectoryButton.addEventListener('click', () => void chooseNoteDirectory())
resetNoteDirectoryButton.addEventListener('click', () => {
  selectedNoteDirectory = null
  renderSettingsForm()
})
settingsDialog.addEventListener('click', (event) => {
  if (event.target === settingsDialog) closeSettings()
})
settingsDialog.addEventListener('cancel', (event) => {
  event.preventDefault()
  closeSettings()
})
settingsDialog.addEventListener('close', () => {
  resetSettingsDialogState()
  settingsButton.focus()
})

function resetSettingsDialogState(): void {
  clearApiKeyDraft(apiKeyInput)
  settingsSnapshot = undefined
  selectedNoteDirectory = null
  clearSavedApiKey = false
  hideSettingsError()
}

window.qwenNotes.onSessionEvent(handleSessionEvent)

async function startTranscription(): Promise<void> {
  if (capture || stopping) return

  resetTranscript()
  hideMessage()
  setControls(false, false)
  setStatus('connecting', '正在请求系统音频权限…')

  let requestedCapture: SystemAudioCapture | undefined
  let sessionStarted = false

  try {
    requestedCapture = await SystemAudioCapture.request()
    const result = await window.qwenNotes.startSession({ title: courseTitle.value })
    sessionStarted = true
    currentNotePath = result.notePath
    showNotePath(result.notePath)

    capture = requestedCapture
    await capture.start({
      onAudio: (chunk) => window.qwenNotes.sendAudio(chunk),
      onLevel: updateLevel,
      onEnded: () => {
        showMessage('系统音频共享已结束，正在停止转写。', 'warning')
        void stopTranscription()
      }
    })

    stopping = false
    setControls(false, true)
    setStatus('running', '正在转写系统音频')
    startSilenceMonitor()
  } catch (error) {
    await requestedCapture?.stop()
    capture = undefined
    if (sessionStarted) await window.qwenNotes.stopSession()
    setControls(true, false)
    setStatus('error', '启动失败')
    showMessage(userFacingError(error), 'error')
  }
}

async function stopTranscription(): Promise<void> {
  if (stopping) return
  if (!capture) {
    setControls(true, false)
    return
  }

  stopping = true
  setControls(false, false)
  setStatus('stopping', '正在等待最后一句识别结果…')
  stopSilenceMonitor()
  levelBar.style.width = '0%'
  silenceHint.hidden = true

  const activeCapture = capture
  capture = undefined

  try {
    await activeCapture.stop()
    await window.qwenNotes.stopSession()
    setStatus('stopped', '转写已停止，笔记已保存')
  } catch (error) {
    setStatus('error', '停止时发生错误')
    showMessage(userFacingError(error), 'error')
  } finally {
    stopping = false
    setControls(true, false)
  }
}

async function openSettings(): Promise<void> {
  if (!settingsCanOpen || settingsPending || settingsDialog.open) return

  settingsButton.disabled = true
  hideSettingsError()
  try {
    settingsSnapshot = await window.qwenNotes.getSettings()
    selectedNoteDirectory = settingsSnapshot.isDefaultNoteDirectory
      ? null
      : settingsSnapshot.noteDirectory
    clearSavedApiKey = false
    apiKeyInput.value = ''
    renderSettingsForm()
    settingsDialog.showModal()
    apiKeyInput.focus()
  } catch (error) {
    showMessage(userFacingError(error), 'error')
  } finally {
    settingsButton.disabled = !settingsCanOpen
  }
}

function closeSettings(): void {
  if (!settingsDialog.open || settingsPending || choosingNoteDirectory) return
  resetSettingsDialogState()
  settingsDialog.close()
  settingsButton.focus()
}

async function saveSettings(): Promise<void> {
  if (!settingsSnapshot || settingsPending || choosingNoteDirectory) return

  hideSettingsError()
  setSettingsPending(true)
  try {
    const request = buildSaveSettingsRequest(
      apiKeyInput.value,
      clearSavedApiKey,
      selectedNoteDirectory
    )
    settingsSnapshot = await window.qwenNotes.saveSettings(request)
    selectedNoteDirectory = settingsSnapshot.isDefaultNoteDirectory
      ? null
      : settingsSnapshot.noteDirectory
    clearSavedApiKey = false
    apiKeyInput.value = ''
    resetSettingsDialogState()
    settingsDialog.close()
    settingsButton.focus()
    showMessage('设置已保存，将在下次转写时生效。', 'success')
  } catch (error) {
    showSettingsError(userFacingError(error))
  } finally {
    setSettingsPending(false)
  }
}

async function chooseNoteDirectory(): Promise<void> {
  if (!settingsSnapshot || settingsPending || choosingNoteDirectory) return

  choosingNoteDirectory = true
  hideSettingsError()
  renderSettingsForm()
  try {
    const currentPath = selectedNoteDirectory ?? settingsSnapshot.defaultNoteDirectory
    const selectedPath = await window.qwenNotes.chooseNoteDirectory(currentPath)
    if (selectedPath) {
      selectedNoteDirectory =
        selectedPath === settingsSnapshot.defaultNoteDirectory ? null : selectedPath
    }
  } catch (error) {
    showSettingsError(userFacingError(error))
  } finally {
    choosingNoteDirectory = false
    renderSettingsForm()
  }
}

function renderSettingsForm(): void {
  if (!settingsSnapshot) return

  const hasNewApiKey = Boolean(apiKeyInput.value.trim())
  if (hasNewApiKey) {
    apiKeyStatus.textContent = '将保存新密钥'
    apiKeyStatus.dataset.state = 'changed'
  } else if (clearSavedApiKey) {
    apiKeyStatus.textContent = '将清除'
    apiKeyStatus.dataset.state = 'cleared'
  } else if (settingsSnapshot.hasApiKey) {
    apiKeyStatus.textContent = '已安全保存'
    apiKeyStatus.dataset.state = 'configured'
  } else {
    apiKeyStatus.textContent = '应用内未保存'
    apiKeyStatus.dataset.state = 'default'
  }

  clearApiKeyButton.hidden = !settingsSnapshot.hasApiKey
  clearApiKeyButton.textContent = clearSavedApiKey ? '保留已保存密钥' : '清除已保存密钥'

  const usesDefaultDirectory = selectedNoteDirectory === null
  noteDirectoryInput.value =
    selectedNoteDirectory ?? settingsSnapshot.defaultNoteDirectory
  noteDirectoryMode.textContent = usesDefaultDirectory ? '默认位置' : '自定义位置'
  noteDirectoryMode.dataset.state = usesDefaultDirectory ? 'default' : 'configured'

  apiKeyInput.disabled = settingsPending
  clearApiKeyButton.disabled = settingsPending
  chooseNoteDirectoryButton.disabled = settingsPending || choosingNoteDirectory
  chooseNoteDirectoryButton.textContent = choosingNoteDirectory ? '选择中…' : '选择文件夹'
  resetNoteDirectoryButton.disabled =
    settingsPending || choosingNoteDirectory || usesDefaultDirectory
}

function setSettingsPending(pending: boolean): void {
  settingsPending = pending
  settingsCloseButton.disabled = pending
  settingsCancelButton.disabled = pending
  settingsSaveButton.disabled = pending
  settingsSaveButton.textContent = pending ? '正在保存…' : '保存设置'
  renderSettingsForm()
}

function showSettingsError(message: string): void {
  settingsError.textContent = message
  settingsError.hidden = false
}

function hideSettingsError(): void {
  settingsError.textContent = ''
  settingsError.hidden = true
}

function handleSessionEvent(event: SessionEvent): void {
  switch (event.kind) {
    case 'status':
      setStatus(event.phase, event.message)
      break
    case 'partial':
      emptyState.hidden = true
      currentPartialItem = event.itemId
      partialTranscript.textContent = event.text
      scrollTranscriptToEnd()
      break
    case 'final':
      appendFinalParagraph(event.text)
      if (currentPartialItem === event.itemId) {
        currentPartialItem = ''
        partialTranscript.textContent = ''
      }
      break
    case 'warning':
      showMessage(event.message, 'warning')
      break
    case 'fatal':
      showMessage(event.message, 'error')
      setStatus('error', '转写已停止')
      void stopCaptureAfterFatal()
      break
    case 'saved':
      currentNotePath = event.notePath
      showNotePath(event.notePath)
      break
  }
}

async function stopCaptureAfterFatal(): Promise<void> {
  const activeCapture = capture
  capture = undefined
  stopSilenceMonitor()
  await activeCapture?.stop()
  stopping = false
  setControls(true, false)
}

function appendFinalParagraph(textInput: string): void {
  const text = textInput.trim()
  if (!text) return

  emptyState.hidden = true
  finalizedTranscriptParagraphs.push(text)
  const paragraph = document.createElement('p')
  paragraph.textContent = text
  finalTranscript.append(paragraph)
  finalizedParagraphs += 1
  paragraphCount.textContent = `${finalizedParagraphs} 个段落`
  copyAllButton.disabled = false
  scrollTranscriptToEnd()
}

async function copyAllTranscript(): Promise<void> {
  const text = buildTranscriptText(finalizedTranscriptParagraphs)
  if (!text) return

  try {
    await window.qwenNotes.copyTranscript(text)
    showCopySuccess()
  } catch (error) {
    showMessage(`复制失败：${userFacingError(error)}`, 'error')
  }
}

function showCopySuccess(): void {
  resetCopyFeedback()
  copyButtonLabel.textContent = '已复制'
  copyAllButton.classList.add('copied')
  copyFeedbackTimer = window.setTimeout(() => {
    copyFeedbackTimer = undefined
    copyButtonLabel.textContent = '复制全部'
    copyAllButton.classList.remove('copied')
  }, 1_500)
}

function resetCopyFeedback(): void {
  if (copyFeedbackTimer !== undefined) window.clearTimeout(copyFeedbackTimer)
  copyFeedbackTimer = undefined
  copyButtonLabel.textContent = '复制全部'
  copyAllButton.classList.remove('copied')
}

function updateLevel(level: number): void {
  const percentage = Math.min(100, Math.max(0, level * 500))
  levelBar.style.width = `${percentage}%`
  if (level > 0.001) {
    lastSignalAt = Date.now()
    silenceHint.hidden = true
  }
}

function startSilenceMonitor(): void {
  stopSilenceMonitor()
  lastSignalAt = Date.now()
  silenceTimer = window.setInterval(() => {
    silenceHint.hidden = Date.now() - lastSignalAt < 5_000
  }, 1_000)
}

function stopSilenceMonitor(): void {
  if (silenceTimer !== undefined) window.clearInterval(silenceTimer)
  silenceTimer = undefined
}

function resetTranscript(): void {
  finalTranscript.replaceChildren()
  finalizedTranscriptParagraphs.splice(0)
  partialTranscript.textContent = ''
  emptyState.hidden = false
  finalizedParagraphs = 0
  currentPartialItem = ''
  paragraphCount.textContent = '0 个段落'
  copyAllButton.disabled = true
  resetCopyFeedback()
}

function setControls(canStart: boolean, canStop: boolean): void {
  startButton.disabled = !canStart
  stopButton.disabled = !canStop
  courseTitle.disabled = !canStart
  settingsCanOpen = canStart
  settingsButton.disabled = !canStart
}

function setStatus(phase: SessionPhase, message: string): void {
  statusBadge.className = `status-badge ${phase}`
  statusText.textContent = message
  healthState.textContent = audioStateLabel(phase)
}

function audioStateLabel(phase: SessionPhase): string {
  switch (phase) {
    case 'running':
      return '正在接收'
    case 'connecting':
    case 'reconnecting':
      return '正在连接'
    case 'stopping':
      return '正在结束'
    case 'error':
      return '连接异常'
    default:
      return '等待信号'
  }
}

function showNotePath(path: string): void {
  notePath.textContent = path
  noteLocation.hidden = false
}

function showMessage(message: string, type: 'warning' | 'error' | 'success'): void {
  if (messageTimer !== undefined) window.clearTimeout(messageTimer)
  messageTimer = undefined
  messageBox.textContent = message
  messageBox.className = `message-box ${type}`
  messageBox.hidden = false
  if (type === 'success') {
    messageTimer = window.setTimeout(() => hideMessage(), 2_800)
  }
}

function hideMessage(): void {
  if (messageTimer !== undefined) window.clearTimeout(messageTimer)
  messageTimer = undefined
  messageBox.hidden = true
  messageBox.textContent = ''
}

function scrollTranscriptToEnd(): void {
  const transcript = element<HTMLDivElement>('transcript')
  transcript.scrollTop = transcript.scrollHeight
}

function userFacingError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('Permission') || message.includes('permission') || message.includes('NotAllowed')) {
    return '系统音频权限被拒绝。请在“系统设置 → 隐私与安全性 → 屏幕与系统音频录制”中允许 Electron 或终端，然后重启应用。'
  }
  return message.replace(/^Error invoking remote method '[^']+': Error:\s*/, '')
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (!value) throw new Error(`缺少界面元素 #${id}`)
  return value as T
}
