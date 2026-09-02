import WebSocket, { type RawData } from 'ws'
import {
  createAudioAppend,
  createSessionFinish,
  createSessionUpdate,
  parseServerEvent,
  serverErrorMessage
} from './protocol'

export interface RealtimeClientCallbacks {
  onPartial(itemId: string, text: string): void
  onFinal(itemId: string, text: string): void
  onStatus(phase: 'connecting' | 'running' | 'reconnecting' | 'stopping', message: string): void
  onWarning(message: string): void
  onFatal(message: string): void
}

export interface RealtimeClientOptions {
  url: string
  apiKey: string
  callbacks: RealtimeClientCallbacks
  maxQueuedAudioBytes?: number
  retryDelaysMs?: readonly number[]
  connectionTimeoutMs?: number
  finishTimeoutMs?: number
}

const DEFAULT_RETRY_DELAYS = [500, 1_000, 2_000] as const
const DEFAULT_MAX_QUEUE_BYTES = 16_000 * 2 * 10

export class QwenRealtimeClient {
  private socket: WebSocket | undefined
  private ready = false
  private keepAlive = false
  private finishing = false
  private reconnecting = false
  private queuedAudio: Uint8Array[] = []
  private queuedAudioBytes = 0
  private queueWarningSent = false
  private finishResolve: (() => void) | undefined

  private readonly retryDelaysMs: readonly number[]
  private readonly maxQueuedAudioBytes: number
  private readonly connectionTimeoutMs: number
  private readonly finishTimeoutMs: number

  constructor(private readonly options: RealtimeClientOptions) {
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS
    this.maxQueuedAudioBytes = options.maxQueuedAudioBytes ?? DEFAULT_MAX_QUEUE_BYTES
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 10_000
    this.finishTimeoutMs = options.finishTimeoutMs ?? 10_000
  }

  async connect(): Promise<void> {
    if (this.keepAlive || this.ready) {
      throw new Error('实时识别连接已经启动')
    }

    this.keepAlive = true
    this.finishing = false
    this.options.callbacks.onStatus('connecting', '正在连接千问实时识别…')

    try {
      await this.openSocket()
    } catch (error) {
      this.keepAlive = false
      this.closeSocket()
      throw new Error(`连接千问失败：${errorMessage(error)}`)
    }
  }

  appendAudio(chunk: Uint8Array): void {
    if (!this.keepAlive || this.finishing || chunk.byteLength === 0) return

    const ownedChunk = Uint8Array.from(chunk)
    if (this.ready && this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.sendAudioNow(ownedChunk)
        return
      } catch {
        this.ready = false
        this.enqueueAudio(ownedChunk)
        this.socket.close()
        return
      }
    }

    this.enqueueAudio(ownedChunk)
  }

  async finish(): Promise<void> {
    if (this.finishing) return

    this.finishing = true
    this.keepAlive = false
    this.options.callbacks.onStatus('stopping', '正在等待最后一句识别结果…')

    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) {
      this.closeSocket()
      return
    }

    const finished = new Promise<void>((resolve) => {
      this.finishResolve = resolve
    })

    this.socket.send(JSON.stringify(createSessionFinish()))

    let timedOut = false
    await Promise.race([
      finished,
      delay(this.finishTimeoutMs).then(() => {
        timedOut = true
      })
    ])

    if (timedOut) {
      this.options.callbacks.onWarning('等待最后一句超时，已保留此前完成的全部笔记。')
    }

    this.closeSocket()
  }

  dispose(): void {
    this.keepAlive = false
    this.finishing = true
    this.queuedAudio = []
    this.queuedAudioBytes = 0
    this.finishResolve?.()
    this.finishResolve = undefined
    this.closeSocket()
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.options.url, {
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
          'User-Agent': 'keji-course-notes/1.0.0'
        }
      })
      this.socket = socket
      this.ready = false

      let settled = false
      let becameReady = false
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error('连接或会话初始化超时'))
        socket.close()
      }, this.connectionTimeoutMs)

      const resolveReady = (): void => {
        if (settled) return
        settled = true
        becameReady = true
        clearTimeout(timeout)
        resolve()
      }

      const rejectReady = (error: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        reject(error)
      }

      socket.on('open', () => {
        socket.send(JSON.stringify(createSessionUpdate()))
      })

      socket.on('message', (data: RawData) => {
        this.handleMessage(socket, data, resolveReady, rejectReady)
      })

      socket.on('error', (error) => {
        if (!becameReady) rejectReady(error)
      })

      socket.on('close', () => {
        clearTimeout(timeout)
        if (this.socket !== socket) return

        this.ready = false
        if (!settled) rejectReady(new Error('WebSocket 在会话就绪前关闭'))
        if (becameReady && this.keepAlive && !this.finishing) {
          void this.reconnect()
        }
      })
    })
  }

  private handleMessage(
    socket: WebSocket,
    data: RawData,
    resolveReady: () => void,
    rejectReady: (error: Error) => void
  ): void {
    let event
    try {
      event = parseServerEvent(data)
    } catch (error) {
      this.options.callbacks.onWarning(`无法解析千问消息：${errorMessage(error)}`)
      return
    }

    if (event.type === 'session.updated') {
      if (this.socket !== socket) return
      this.ready = true
      resolveReady()
      this.flushAudioQueue()
      this.options.callbacks.onStatus('running', '正在转写系统音频')
      return
    }

    if (event.type === 'conversation.item.input_audio_transcription.text') {
      const text = `${event.text ?? ''}${event.stash ?? ''}`.trim()
      if (text && event.item_id) this.options.callbacks.onPartial(event.item_id, text)
      return
    }

    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      const transcript = event.transcript?.trim()
      if (transcript && event.item_id) this.options.callbacks.onFinal(event.item_id, transcript)
      return
    }

    if (event.type === 'session.finished') {
      this.finishResolve?.()
      this.finishResolve = undefined
      return
    }

    const message = serverErrorMessage(event)
    if (!message) return

    if (event.type === 'conversation.item.input_audio_transcription.failed') {
      this.options.callbacks.onWarning(message)
      return
    }

    rejectReady(new Error(message))
    this.keepAlive = false
    this.options.callbacks.onFatal(message)
    socket.close()
  }

  private async reconnect(): Promise<void> {
    if (this.reconnecting || !this.keepAlive || this.finishing) return
    this.reconnecting = true

    for (let index = 0; index < this.retryDelaysMs.length; index += 1) {
      if (!this.keepAlive || this.finishing) break

      const attempt = index + 1
      this.options.callbacks.onStatus(
        'reconnecting',
        `网络连接中断，正在进行第 ${attempt}/${this.retryDelaysMs.length} 次重连…`
      )
      await delay(this.retryDelaysMs[index] ?? 0)
      if (!this.keepAlive || this.finishing) break

      try {
        await this.openSocket()
        this.reconnecting = false
        return
      } catch (error) {
        this.options.callbacks.onWarning(`第 ${attempt} 次重连失败：${errorMessage(error)}`)
      }
    }

    this.reconnecting = false
    if (this.keepAlive && !this.finishing) {
      this.keepAlive = false
      this.options.callbacks.onFatal('网络重连失败，转写已停止；此前内容已经保存。')
    }
  }

  private enqueueAudio(chunk: Uint8Array): void {
    this.queuedAudio.push(chunk)
    this.queuedAudioBytes += chunk.byteLength

    let dropped = false
    while (this.queuedAudioBytes > this.maxQueuedAudioBytes && this.queuedAudio.length > 0) {
      const oldest = this.queuedAudio.shift()
      if (!oldest) break
      this.queuedAudioBytes -= oldest.byteLength
      dropped = true
    }

    if (dropped && !this.queueWarningSent) {
      this.queueWarningSent = true
      this.options.callbacks.onWarning('网络中断超过 10 秒，最早的一小段音频无法保留。')
    }
  }

  private flushAudioQueue(): void {
    while (this.ready && this.socket?.readyState === WebSocket.OPEN && this.queuedAudio.length > 0) {
      const chunk = this.queuedAudio.shift()
      if (!chunk) break
      this.queuedAudioBytes -= chunk.byteLength
      try {
        this.sendAudioNow(chunk)
      } catch {
        this.queuedAudio.unshift(chunk)
        this.queuedAudioBytes += chunk.byteLength
        this.ready = false
        this.socket.close()
        break
      }
    }

    if (this.queuedAudio.length === 0) this.queueWarningSent = false
  }

  private sendAudioNow(chunk: Uint8Array): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 尚未连接')
    }
    this.socket.send(JSON.stringify(createAudioAppend(chunk)))
  }

  private closeSocket(): void {
    const socket = this.socket
    this.socket = undefined
    this.ready = false
    if (!socket) return

    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, 'ASR session closed')
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
