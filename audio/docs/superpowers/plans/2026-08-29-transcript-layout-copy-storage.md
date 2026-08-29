# Transcript Layout, Copy, and Date Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make transcript text use the full document width, add reliable one-click copying of finalized paragraphs, and save new Markdown notes under `doc/YY/M/D/`.

**Architecture:** `NoteWriter` derives a nested date directory from the session start time. The renderer keeps finalized paragraph strings as its copy source, a shared pure function produces plain text, and a narrow preload IPC method delegates clipboard writes to Electron's main process. Existing Qwen, audio, and Markdown flows remain unchanged.

**Tech Stack:** Electron 37, TypeScript 5.9, electron-vite 5, Vitest 3, Node.js filesystem APIs.

## Global Constraints

- Copy only finalized transcript paragraphs, joined by one blank line.
- Exclude partial text, title, start time, model, and Markdown separators from copied text.
- New note directories use `doc/<two-digit-year>/<un-padded-month>/<un-padded-day>/`.
- Keep the existing `YYYY-MM-DD_HH-mm-ss_<safe-title>.md` filename and collision suffix behavior.
- Do not migrate existing `notes/` files.
- Preserve context isolation; renderer code must not import Electron directly.
- Do not change audio capture, Qwen event handling, or Markdown body format.

---

## File Structure

- `src/main/notes/note-writer.ts`: derive and create the session date directory.
- `src/main/index.ts`: set the settings system's default note base to the project `doc/` directory.
- `src/main/transcription-session.ts`: change the default output base from `notes/` to `doc/`.
- `src/shared/transcript-text.ts`: pure finalized-paragraph normalization and joining.
- `src/main/clipboard-writer.ts`: validate an IPC payload and call an injected clipboard writer.
- `src/shared/contracts.ts`: declare the copy IPC channel and preload API method.
- `src/preload/index.ts`: expose `copyTranscript(text)` through the context bridge.
- `src/main/index.ts`: bind the copy IPC handler to Electron `clipboard.writeText`.
- `src/renderer/index.html`: add the disabled-by-default copy button beside the paragraph count.
- `src/renderer/src/main.ts`: maintain finalized paragraph strings and drive copy button behavior.
- `src/renderer/src/styles.css`: remove the `720px` cap and style document actions and copy feedback.
- `tests/note-writer.test.ts`: cover date directory creation and collision behavior inside it.
- `tests/transcript-text.test.ts`: cover finalized text normalization and joining.
- `tests/clipboard-writer.test.ts`: cover clipboard payload validation and delegation.
- `tests/renderer-ui.test.ts`: guard the copy control markup and full-width transcript CSS.
- `README.md`: document the new output path and copy action.
- `.gitignore`: ignore generated `doc/` notes.

---

### Task 1: Date-grouped note storage

**Files:**
- Modify: `tests/note-writer.test.ts`
- Modify: `src/main/notes/note-writer.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/transcription-session.ts`

**Interfaces:**
- Consumes: `NoteWriterOptions.outputDirectory` as the configured base output directory and `now(): Date` as the session start time. The settings feature may provide a custom base; otherwise the base is `<project>/doc`.
- Produces: `NoteWriter.create(titleInput: string): string`, returning a path below `<base>/YY/M/D/`.

- [ ] **Step 1: Change the path expectations before production code**

Update the first test to expect:

```ts
const expectedDirectory = join(directory, '26', '8', '29')
expect(path).toBe(join(expectedDirectory, '2026-08-29_09-00-08_TypeScript 网课.md'))
```

Update the collision assertions to exact paths:

```ts
const expectedDirectory = join(directory, '26', '8', '29')
expect(first).toBe(join(expectedDirectory, '2026-08-29_09-00-08_课程.md'))
expect(second).toBe(join(expectedDirectory, '2026-08-29_09-00-08_课程-2.md'))
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run tests/note-writer.test.ts`

Expected: FAIL because the writer still creates files directly in the supplied base directory.

- [ ] **Step 3: Create the nested date directory**

In `NoteWriter.create`, resolve a session directory before calling `mkdirSync` and `uniquePath`:

```ts
const outputDirectory = resolve(
  this.options.outputDirectory,
  pad(now.getFullYear() % 100),
  String(now.getMonth() + 1),
  String(now.getDate())
)
mkdirSync(outputDirectory, { recursive: true })

const timestamp = fileTimestamp(now)
const baseName = `${timestamp}_${safeFilename(title)}`
const notePath = uniquePath(outputDirectory, baseName)
```

Change both default-base declarations while preserving a custom directory selected in Settings:

```ts
const defaultNoteDirectory = resolve(process.cwd(), 'doc')

outputDirectory: options.outputDirectory ?? resolve(process.cwd(), 'doc'),
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- --run tests/note-writer.test.ts`

Expected: all `note-writer` tests PASS.

- [ ] **Step 5: Commit the storage behavior**

```bash
git add tests/note-writer.test.ts src/main/notes/note-writer.ts src/main/index.ts src/main/transcription-session.ts
git commit -m "feat: group transcript notes by date"
```

---

### Task 2: Finalized transcript text builder

**Files:**
- Create: `tests/transcript-text.test.ts`
- Create: `src/shared/transcript-text.ts`

**Interfaces:**
- Consumes: `readonly string[]` containing renderer-received finalized transcript values.
- Produces: `buildTranscriptText(paragraphs: readonly string[]): string`.

- [ ] **Step 1: Write the failing text-builder tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildTranscriptText } from '../src/shared/transcript-text'

describe('buildTranscriptText', () => {
  it('trims finalized paragraphs and separates them with one blank line', () => {
    expect(buildTranscriptText([' 第一段。 ', '第二段。'])).toBe('第一段。\n\n第二段。')
  })

  it('omits empty paragraphs and returns empty text when none remain', () => {
    expect(buildTranscriptText(['', '  ', '\n'])).toBe('')
    expect(buildTranscriptText(['第一段。', ' ', '第二段。'])).toBe('第一段。\n\n第二段。')
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run tests/transcript-text.test.ts`

Expected: FAIL because `src/shared/transcript-text.ts` does not exist.

- [ ] **Step 3: Add the minimal pure implementation**

```ts
export function buildTranscriptText(paragraphs: readonly string[]): string {
  return paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join('\n\n')
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --run tests/transcript-text.test.ts`

Expected: both tests PASS.

- [ ] **Step 5: Commit the pure copy source**

```bash
git add tests/transcript-text.test.ts src/shared/transcript-text.ts
git commit -m "feat: build plain transcript copy text"
```

---

### Task 3: Main-process clipboard boundary

**Files:**
- Create: `tests/clipboard-writer.test.ts`
- Create: `src/main/clipboard-writer.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: IPC payload `unknown` and `(text: string) => void` clipboard writer.
- Produces: `writeTranscriptToClipboard(value: unknown, writeText: (text: string) => void): void` and `QwenNotesApi.copyTranscript(text: string): Promise<void>`.

- [ ] **Step 1: Write failing clipboard boundary tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { writeTranscriptToClipboard } from '../src/main/clipboard-writer'

describe('writeTranscriptToClipboard', () => {
  it('writes finalized transcript text unchanged', () => {
    const writeText = vi.fn()
    writeTranscriptToClipboard('第一段。\n\n第二段。', writeText)
    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledWith('第一段。\n\n第二段。')
  })

  it.each([undefined, 42, '', '   '])('rejects an empty or non-string payload: %s', (value) => {
    const writeText = vi.fn()
    expect(() => writeTranscriptToClipboard(value, writeText)).toThrow('没有可复制的正文')
    expect(writeText).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run tests/clipboard-writer.test.ts`

Expected: FAIL because `src/main/clipboard-writer.ts` does not exist.

- [ ] **Step 3: Add payload validation and delegation**

```ts
export function writeTranscriptToClipboard(
  value: unknown,
  writeText: (text: string) => void
): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('没有可复制的正文')
  }
  writeText(value)
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --run tests/clipboard-writer.test.ts`

Expected: both clipboard cases PASS.

- [ ] **Step 5: Wire the typed IPC path**

Add `copy: 'notes:copy'` to `IPC_CHANNELS`, and add this API contract:

```ts
copyTranscript(text: string): Promise<void>
```

Expose it in preload:

```ts
copyTranscript(text: string): Promise<void> {
  return ipcRenderer.invoke(IPC_CHANNELS.copy, text)
},
```

Import Electron `clipboard` and `writeTranscriptToClipboard` in the main process, then register:

```ts
ipcMain.handle(IPC_CHANNELS.copy, (_event, value: unknown) => {
  writeTranscriptToClipboard(value, (text) => clipboard.writeText(text))
})
```

- [ ] **Step 6: Verify the complete IPC type path**

Run: `npm run typecheck`

Expected: both node and web TypeScript projects PASS with no diagnostics.

- [ ] **Step 7: Commit the clipboard boundary**

```bash
git add tests/clipboard-writer.test.ts src/main/clipboard-writer.ts src/shared/contracts.ts src/preload/index.ts src/main/index.ts
git commit -m "feat: expose transcript clipboard action"
```

---

### Task 4: Copy control and responsive transcript layout

**Files:**
- Create: `tests/renderer-ui.test.ts`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/src/main.ts`
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: `buildTranscriptText(readonly string[])` and `window.qwenNotes.copyTranscript(text)` from Tasks 2 and 3.
- Produces: disabled-by-default `#copyAllButton`, `#copyButtonLabel`, full-width transcript paragraphs, success feedback, and retained copy availability after stopping.

- [ ] **Step 1: Write failing renderer structure and layout tests**

Read the source files and assert the user-facing contract:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const html = readFileSync(resolve('src/renderer/index.html'), 'utf8')
const css = readFileSync(resolve('src/renderer/src/styles.css'), 'utf8')

describe('transcript renderer UI', () => {
  it('includes a disabled copy-all button beside document metadata', () => {
    expect(html).toMatch(/id="copyAllButton"[^>]*disabled/)
    expect(html).toContain('id="copyButtonLabel"')
    expect(html).toContain('复制全部')
  })

  it('does not cap transcript paragraphs at 720px', () => {
    const transcriptRules = css.slice(css.indexOf('.final-transcript p,'), css.indexOf('.workspace-footer'))
    expect(transcriptRules).not.toContain('max-width: 720px')
    expect(transcriptRules).toContain('width: 100%')
    expect(transcriptRules).toContain('overflow-wrap: anywhere')
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run tests/renderer-ui.test.ts`

Expected: FAIL because the copy control is absent and transcript paragraphs still have `max-width: 720px`.

- [ ] **Step 3: Add the copy control markup**

Replace the standalone paragraph-count span with:

```html
<div class="document-actions">
  <button
    id="copyAllButton"
    class="copy-button"
    type="button"
    title="复制所有已确认正文"
    disabled
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
    <span id="copyButtonLabel">复制全部</span>
  </button>
  <span id="paragraphCount" class="paragraph-count">0 个段落</span>
</div>
```

- [ ] **Step 4: Maintain finalized text and copy it**

Import and cache the copy dependencies:

```ts
import { buildTranscriptText } from '../../shared/transcript-text'

const copyAllButton = element<HTMLButtonElement>('copyAllButton')
const copyButtonLabel = element<HTMLSpanElement>('copyButtonLabel')
const finalizedTranscriptParagraphs: string[] = []
let copyFeedbackTimer: number | undefined

copyAllButton.addEventListener('click', () => void copyAllTranscript())
```

Replace the final-paragraph function body with:

```ts
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
```

Add these lines to `resetTranscript()` after clearing the DOM:

```ts
finalizedTranscriptParagraphs.splice(0)
copyAllButton.disabled = true
resetCopyFeedback()
```

Implement copying and feedback:

```ts
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
```

- [ ] **Step 5: Remove the width cap and style the actions**

Change the transcript text rule to:

```css
.final-transcript p,
.partial-transcript {
  width: 100%;
  margin: 0 0 17px;
  overflow-wrap: anywhere;
  color: #344139;
  font-family: ui-serif, "Songti SC", "STSong", Georgia, serif;
  font-size: 14px;
  line-height: 1.85;
  letter-spacing: 0.005em;
}
```

Add the exact document-action rules before `.paragraph-count`:

```css
.document-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.copy-button {
  display: inline-flex;
  height: 28px;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid #dfe8e0;
  border-radius: 999px;
  outline: 0;
  background: #f7faf7;
  color: #557060;
  cursor: pointer;
  font-size: 8px;
  font-weight: 700;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
}

.copy-button svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.copy-button:not(:disabled):hover,
.copy-button.copied {
  border-color: #c8dfce;
  background: #edf7ef;
  color: #347047;
}

.copy-button:focus-visible {
  box-shadow: 0 0 0 3px rgba(68, 133, 88, 0.13);
}

.copy-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
```

- [ ] **Step 6: Run focused tests and type checking**

Run: `npm test -- --run tests/renderer-ui.test.ts tests/transcript-text.test.ts`

Expected: all focused tests PASS.

Run: `npm run typecheck`

Expected: PASS with no diagnostics.

- [ ] **Step 7: Commit the renderer behavior**

```bash
git add tests/renderer-ui.test.ts src/renderer/index.html src/renderer/src/main.ts src/renderer/src/styles.css
git commit -m "feat: copy all finalized transcript text"
```

---

### Task 5: Documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: implemented UI and storage behavior from Tasks 1–4.
- Produces: accurate usage documentation and ignored generated `doc/` output.

- [ ] **Step 1: Update generated-output ignore rules**

Replace the `notes/` ignore entry with:

```gitignore
notes/
doc/
```

Keeping `notes/` ignored preserves existing local files; `doc/` covers all new output.

- [ ] **Step 2: Update README usage and path examples**

Add this sentence after the numbered startup instructions:

```markdown
有最终确认的内容后，可点击文档栏中的“复制全部”；剪贴板只包含正文段落，不包含标题、时间、模型或仍在变化的临时字幕。
```

Replace the default path example with:

```text
doc/26/8/29/2026-08-29_09-00-08_TypeScript 网课.md
```

Add this sentence after the path example:

```markdown
目录按会话开始日期自动创建；已有的 `notes/` 文件不会自动迁移。
```

- [ ] **Step 3: Run the full automated verification**

Run: `npm test`

Expected: all test files PASS.

Run: `npm run typecheck`

Expected: PASS with no diagnostics.

Run: `npm run build`

Expected: main, preload, and renderer production builds all complete successfully.

- [ ] **Step 4: Perform Electron smoke verification**

With the development app running, verify:

1. The transcript paragraph computed width exceeds `720px` in a wide window and no horizontal scrollbar appears.
2. The copy button is disabled with zero finalized paragraphs.
3. Finalized sample paragraphs enable the button and copy plain paragraphs separated by one blank line.
4. The button shows `已复制` and restores `复制全部` after about 1.5 seconds.
5. A new session path displayed in the UI starts with the project `doc/YY/M/D/` directory.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md .gitignore
git commit -m "docs: explain transcript copy and storage"
```

- [ ] **Step 6: Review the final diff for scope**

Run: `git diff 768a272..HEAD --check`

Expected: no whitespace errors, no unrelated files, and all design requirements covered.
