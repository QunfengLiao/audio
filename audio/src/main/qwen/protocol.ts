import { randomUUID } from 'node:crypto'

export const DEFAULT_MODEL = 'qwen3-asr-flash-realtime'
export const LEGACY_BEIJING_REALTIME_URL =
  'wss://dashscope.aliyuncs.com/api-ws/v1/realtime'

export interface QwenConnectionOptions {
  apiKey: string
  model?: string
  workspaceId?: string
  endpointOverride?: string
}

export interface SessionUpdateEvent {
  event_id: string
  type: 'session.update'
  session: {
    modalities: ['text']
    input_audio_format: 'pcm'
    sample_rate: 16000
    turn_detection: {
      type: 'server_vad'
      threshold: number
      silence_duration_ms: number
    }
  }
}

export interface AudioAppendEvent {
  event_id: string
  type: 'input_audio_buffer.append'
  audio: string
}

export interface SessionFinishEvent {
  event_id: string
  type: 'session.finish'
}

export interface QwenServerEvent {
  type: string
  event_id?: string
  item_id?: string
  text?: string
  stash?: string
  transcript?: string
  error?: { code?: string; message?: string; param?: string }
  [key: string]: unknown
}

export function buildRealtimeUrl(options: QwenConnectionOptions): string {
  const model = options.model?.trim() || DEFAULT_MODEL
  const endpoint =
    options.endpointOverride?.trim() ||
    (options.workspaceId?.trim()
      ? `wss://${options.workspaceId.trim()}.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime`
      : LEGACY_BEIJING_REALTIME_URL)

  const url = new URL(endpoint)
  url.searchParams.set('model', model)
  return url.toString()
}

export function createSessionUpdate(): SessionUpdateEvent {
  return {
    event_id: `event_${randomUUID()}`,
    type: 'session.update',
    session: {
      modalities: ['text'],
      input_audio_format: 'pcm',
      sample_rate: 16000,
      turn_detection: {
        type: 'server_vad',
        threshold: 0.2,
        silence_duration_ms: 800
      }
    }
  }
}

export function createAudioAppend(audio: Uint8Array): AudioAppendEvent {
  return {
    event_id: `event_${randomUUID()}`,
    type: 'input_audio_buffer.append',
    audio: Buffer.from(audio).toString('base64')
  }
}

export function createSessionFinish(): SessionFinishEvent {
  return {
    event_id: `event_${randomUUID()}`,
    type: 'session.finish'
  }
}

export function parseServerEvent(value: unknown): QwenServerEvent {
  const text =
    typeof value === 'string'
      ? value
      : Buffer.isBuffer(value)
        ? value.toString('utf8')
        : value instanceof ArrayBuffer
          ? Buffer.from(value).toString('utf8')
          : String(value)

  const parsed: unknown = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
    throw new Error('千问返回了缺少 type 字段的消息')
  }

  const type = (parsed as { type?: unknown }).type
  if (typeof type !== 'string') {
    throw new Error('千问返回了无效的 type 字段')
  }

  return parsed as QwenServerEvent
}

export function serverErrorMessage(event: QwenServerEvent): string | undefined {
  if (event.type === 'error') {
    return event.error?.message || event.error?.code || '千问服务返回未知错误'
  }
  if (event.type === 'conversation.item.input_audio_transcription.failed') {
    return event.error?.message || event.error?.code || '当前语音片段识别失败'
  }
  return undefined
}
