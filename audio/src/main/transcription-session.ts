import { resolve } from 'node:path'
import type { SessionEvent } from '../shared/contracts'
import { NoteWriter } from './notes/note-writer'
import { QwenRealtimeClient } from './qwen/realtime-client'
import {
  buildRealtimeUrl,
  DEFAULT_MODEL,
  type QwenConnectionOptions
} from './qwen/protocol'

export interface TranscriptionSessionOptions extends QwenConnectionOptions {
  outputDirectory?: string
  emit(event: SessionEvent): void
  onClosed(session: TranscriptionSession): void
}

export class TranscriptionSession {
  private readonly writer: NoteWriter
  private readonly client: QwenRealtimeClient
  private closed = false

  constructor(private readonly options: TranscriptionSessionOptions) {
    const model = options.model?.trim() || DEFAULT_MODEL
    this.writer = new NoteWriter({
      outputDirectory: options.outputDirectory ?? resolve(process.cwd(), 'doc'),
      model
    })

    this.client = new QwenRealtimeClient({
      url: buildRealtimeUrl(options),
      apiKey: options.apiKey,
      callbacks: {
        onPartial: (itemId, text) => options.emit({ kind: 'partial', itemId, text }),
        onFinal: (itemId, text) => this.handleFinal(itemId, text),
        onStatus: (phase, message) => options.emit({ kind: 'status', phase, message }),
        onWarning: (message) => options.emit({ kind: 'warning', message }),
        onFatal: (message) => this.handleFatal(message)
      }
    })
  }

  async start(title: string): Promise<string> {
    try {
      await this.client.connect()
      const notePath = this.writer.create(title)
      this.options.emit({ kind: 'saved', notePath })
      return notePath
    } catch (error) {
      this.client.dispose()
      this.closed = true
      this.options.onClosed(this)
      throw error
    }
  }

  appendAudio(chunk: Uint8Array): void {
    if (!this.closed) this.client.appendAudio(chunk)
  }

  async stop(): Promise<void> {
    if (this.closed) return
    this.closed = true

    try {
      await this.client.finish()
      this.options.emit({ kind: 'status', phase: 'stopped', message: '转写已停止，笔记已保存' })
    } finally {
      this.client.dispose()
      this.options.onClosed(this)
    }
  }

  dispose(): void {
    if (this.closed) return
    this.closed = true
    this.client.dispose()
    this.options.onClosed(this)
  }

  private handleFinal(itemId: string, text: string): void {
    if (this.closed) return
    try {
      this.writer.appendParagraph(text)
      this.options.emit({ kind: 'final', itemId, text })
    } catch (error) {
      this.handleFatal(`写入 Markdown 失败：${errorMessage(error)}`)
    }
  }

  private handleFatal(message: string): void {
    if (this.closed) return
    this.options.emit({ kind: 'fatal', message })
    this.dispose()
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
