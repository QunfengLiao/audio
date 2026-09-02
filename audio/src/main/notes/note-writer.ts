import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_MODEL } from '../qwen/protocol'

const INVALID_FILENAME_CHARACTERS = /[\\/:*?"<>|]/g

export interface NoteWriterOptions {
  outputDirectory: string
  model?: string
  now?: () => Date
}

export class NoteWriter {
  private readonly now: () => Date
  private readonly model: string
  private notePath: string | undefined

  constructor(private readonly options: NoteWriterOptions) {
    this.now = options.now ?? (() => new Date())
    this.model = options.model?.trim() || DEFAULT_MODEL
  }

  create(titleInput: string): string {
    const now = this.now()
    const outputDirectory = resolve(
      this.options.outputDirectory,
      pad(now.getFullYear() % 100),
      String(now.getMonth() + 1),
      String(now.getDate())
    )
    mkdirSync(outputDirectory, { recursive: true })

    const title = titleInput.trim()
    const timestamp = fileTimestamp(now)
    const baseName = `${timestamp}_${safeFilename(title || '未命名课程')}`
    const notePath = uniquePath(outputDirectory, baseName)
    writeFileSync(notePath, markdownHeader(title || '未命名课程', now, this.model), 'utf8')
    this.notePath = notePath
    return notePath
  }

  appendParagraph(text: string): void {
    if (!this.notePath) {
      throw new Error('笔记尚未创建')
    }

    const paragraph = text.trim()
    if (!paragraph) return
    appendFileSync(this.notePath, `${paragraph}\n\n`, 'utf8')
  }
}

export function safeFilename(value: string): string {
  return value.replace(INVALID_FILENAME_CHARACTERS, '-').trim()
}

function markdownHeader(title: string, now: Date, model: string): string {
  const timestamp = displayTimestamp(now)
  return (
    `# ${title}\n\n` +
    `- 开始时间：${timestamp}\n` +
    `- 识别模型：${model}\n\n` +
    `---\n\n`
  )
}

function uniquePath(directory: string, baseName: string): string {
  let candidate = resolve(directory, `${baseName}.md`)
  let suffix = 2

  while (existsSync(candidate)) {
    candidate = resolve(directory, `${baseName}-${suffix}.md`)
    suffix += 1
  }

  return candidate
}

function fileTimestamp(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}_${pad(value.getHours())}-${pad(value.getMinutes())}-${pad(value.getSeconds())}`
}

function displayTimestamp(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
