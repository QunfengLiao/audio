# API Key 与笔记目录设置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Electron 主界面增加设置弹窗，安全持久化 DashScope API Key，并允许用户选择后续笔记的保存目录。

**Architecture:** 主进程新增可单测的 `SettingsStore`，通过注入的密钥编解码器加密 API Key，并以版本化 JSON 保存到 `app.getPath('userData')`。共享契约与 preload 只公开配置状态和写入命令；渲染进程无法读取完整密钥。启动每个新转写会话时，主进程按“界面设置优先、环境变量与默认目录回退”的规则解析配置。

**Tech Stack:** Electron 37、TypeScript 5.9、原生 HTML/CSS、Vitest 3、Node.js `fs`。

## Global Constraints

- 设置界面只包含 API Key 与笔记保存文件夹，不包含 BASEURL、模型或工作空间 ID。
- API Key 不得以明文落盘，也不得从主进程回传给渲染进程。
- 未保存界面设置时继续兼容 `DASHSCOPE_API_KEY` 和现有默认笔记目录。
- 运行中的转写会话不允许更改设置。
- 当前 `audio/` 是父仓库中的未跟踪目录；本次不创建 Git 提交。

---

### Task 1: 可测试的安全设置存储

**Files:**
- Create: `src/main/settings/settings-store.ts`
- Create: `tests/settings-store.test.ts`

**Interfaces:**
- Produces: `SecretCodec`, `SettingsStore`, `SettingsStore.getPublicSettings(defaultNoteDirectory)`, `SettingsStore.getApiKey()`, `SettingsStore.getNoteDirectory()`, `SettingsStore.save(request)`。
- Consumes: Node.js 文件系统和由 Electron `safeStorage` 适配的 `SecretCodec`。

- [x] **Step 1: Write the failing storage tests**

```ts
const codec: SecretCodec = {
  isAvailable: () => true,
  encrypt: (value) => Buffer.from(`encrypted:${value}`),
  decrypt: (value) => value.toString('utf8').replace(/^encrypted:/, '')
}

const store = new SettingsStore({ filePath, codec })
store.save({ apiKey: { action: 'replace', value: ' sk-test ' }, noteDirectory })
expect(store.getApiKey()).toBe('sk-test')
expect(readFileSync(filePath, 'utf8')).not.toContain('sk-test')
expect(store.getPublicSettings(defaultDirectory)).toEqual({
  hasApiKey: true,
  noteDirectory,
  isDefaultNoteDirectory: false
})
```

Add cases for `keep`, `clear`, resetting the directory with `null`, unavailable encryption, invalid directories, and corrupted JSON.

- [x] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/settings-store.test.ts`

Expected: FAIL because `src/main/settings/settings-store.ts` does not exist.

- [x] **Step 3: Implement the minimal store**

```ts
export type ApiKeyChange =
  | { action: 'keep' }
  | { action: 'replace'; value: string }
  | { action: 'clear' }

export interface SaveSettingsRequest {
  apiKey: ApiKeyChange
  noteDirectory: string | null
}

export interface PublicSettings {
  hasApiKey: boolean
  noteDirectory: string
  defaultNoteDirectory: string
  isDefaultNoteDirectory: boolean
}

export class SettingsStore {
  constructor(private readonly options: { filePath: string; codec: SecretCodec }) {}
  getPublicSettings(defaultNoteDirectory: string): PublicSettings
  getApiKey(): string | undefined
  getNoteDirectory(): string | undefined
  save(request: SaveSettingsRequest): void
}
```

Persist `{ version: 1, encryptedApiKey?: string, noteDirectory?: string }`. Validate selected directories with `statSync(path).isDirectory()`. Write JSON to `${filePath}.tmp`, then atomically `renameSync` it over the target. Only update the in-memory snapshot after the write succeeds.

- [x] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- tests/settings-store.test.ts`

Expected: all settings-store tests pass and the persisted file contains no plaintext key.

---

### Task 2: 共享契约、IPC 与会话配置接入

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Create: `src/main/settings/settings-ipc.ts`
- Create: `src/main/settings/runtime-settings.ts`
- Create: `tests/runtime-settings.test.ts`
- Create: `tests/settings-ipc.test.ts`

**Interfaces:**
- Consumes: `SettingsStore` from Task 1.
- Produces: renderer APIs `getSettings()`, `saveSettings(request)`, `chooseNoteDirectory(currentPath)` and pure `resolveRuntimeSettings(store, env, defaultDirectory)`.

- [x] **Step 1: Write failing precedence tests**

```ts
expect(resolveRuntimeSettings(configuredStore, { DASHSCOPE_API_KEY: 'env-key' }, defaultDirectory))
  .toEqual({ apiKey: 'saved-key', noteDirectory: selectedDirectory })

expect(resolveRuntimeSettings(emptyStore, { DASHSCOPE_API_KEY: 'env-key' }, defaultDirectory))
  .toEqual({ apiKey: 'env-key', noteDirectory: defaultDirectory })
```

Also assert that placeholder value `sk-your-api-key` is treated as missing.

- [x] **Step 2: Run the precedence tests and verify RED**

Run: `npm test -- tests/runtime-settings.test.ts`

Expected: FAIL because `runtime-settings.ts` does not exist.

- [x] **Step 3: Add contracts and preload methods**

```ts
export interface PublicSettings {
  hasApiKey: boolean
  noteDirectory: string
  defaultNoteDirectory: string
  isDefaultNoteDirectory: boolean
}

export type SaveSettingsRequest = {
  apiKey: { action: 'keep' } | { action: 'replace'; value: string } | { action: 'clear' }
  noteDirectory: string | null
}

export interface QwenNotesApi {
  getSettings(): Promise<PublicSettings>
  saveSettings(request: SaveSettingsRequest): Promise<PublicSettings>
  chooseNoteDirectory(currentPath: string): Promise<string | null>
}
```

Add matching `settings:get`, `settings:save`, and `settings:choose-note-directory` channels and route them through `ipcRenderer.invoke`.

- [x] **Step 4: Implement runtime resolution and main-process handlers**

Create `SettingsStore` only after `app.whenReady()` using `resolve(app.getPath('userData'), 'settings.json')` and a `safeStorage` codec. `settings:get` returns only public state. `settings:save` rejects while `activeSession` exists. `settings:choose-note-directory` uses `dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })`.

Before constructing `TranscriptionSession`, resolve the API key and note directory. Pass `outputDirectory: runtime.noteDirectory`; change the missing-key message to direct the user to Settings. Preserve all existing endpoint, workspace, and model environment handling.

- [x] **Step 5: Run focused and existing main-process tests**

Run: `npm test -- tests/runtime-settings.test.ts tests/note-writer.test.ts tests/qwen-protocol.test.ts tests/realtime-client.test.ts`

Expected: all selected tests pass.

---

### Task 3: 主界面设置弹窗

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/src/main.ts`
- Modify: `src/renderer/src/styles.css`
- Create: `src/renderer/src/settings-form.ts`
- Create: `tests/settings-form.test.ts`

**Interfaces:**
- Consumes: `window.qwenNotes.getSettings`, `saveSettings`, and `chooseNoteDirectory` from Task 2.
- Produces: settings-button and modal behavior; no new cross-process interface.

- [x] **Step 1: Add semantic modal markup**

Add a gear button beside the status badge and a native `<dialog aria-labelledby="settingsTitle">`. The form contains a password input, saved-state text, clear-key button, read-only directory field, choose/reset buttons, inline error area, cancel, and save.

- [x] **Step 2: Implement modal state and validation**

```ts
async function openSettings(): Promise<void> {
  const settings = await window.qwenNotes.getSettings()
  apiKeyInput.value = ''
  selectedNoteDirectory = settings.isDefaultNoteDirectory ? null : settings.noteDirectory
  renderSettings(settings)
  settingsDialog.showModal()
}
```

Track API key intent as `keep | replace | clear`. A non-empty password becomes `replace`; explicit clear becomes `clear`; untouched blank input remains `keep`. Directory reset sends `null`. Keep the modal open on failure and display a concise inline message.

- [x] **Step 3: Integrate session control state**

Update `setControls(canStart, canStop)` so the settings button is enabled only when `canStart` is true. After settings save, close the dialog and show a transient success message without changing transcript state.

- [x] **Step 4: Style the trigger and modal**

Match the existing green/cream visual system. Add responsive modal width, backdrop, field labels, password and path controls, focus-visible states, disabled states, inline error/success text, and reduced-motion compatibility. Ensure long directory paths ellipsize or scroll instead of widening the window.

- [x] **Step 5: Run static verification**

Run: `npm run typecheck`

Expected: both Node and renderer TypeScript projects pass with no errors.

---

### Task 4: Documentation and complete verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: completed settings behavior from Tasks 1–3.
- Produces: accurate setup and usage guidance.

- [x] **Step 1: Update user documentation**

Document the gear-button workflow, encrypted API Key storage, directory selection, `.env` fallback, default location, and the rule that settings cannot change during transcription.

- [x] **Step 2: Run the entire automated suite**

Run: `npm test`

Expected: all test files and tests pass.

- [x] **Step 3: Run typecheck and production build**

Run: `npm run typecheck`

Expected: exit code 0.

Run: `npm run build`

Expected: Electron main, preload, and renderer bundles complete successfully.

- [x] **Step 4: Inspect the final diff and secret boundary**

Run: `git diff --no-index /dev/null src/main/settings/settings-store.ts` for the new store and use `rg -n "apiKey|encryptedApiKey" src tests` to confirm no IPC response exposes the decrypted value. Review all modified files for unrelated changes.

- [x] **Step 5: Manual smoke check**

Launch with `npm run dev`, open Settings in the real Electron window, verify the API Key field is a focused password input, verify the effective/default directory, enter a non-sensitive test draft and confirm the status changes without displaying the value, then cancel and verify the dialog closes, the draft is discarded, and focus returns to the settings button. Do not persist a test key into the user's real application profile.
