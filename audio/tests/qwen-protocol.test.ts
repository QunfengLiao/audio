import { describe, expect, it } from 'vitest'
import {
  buildRealtimeUrl,
  createAudioAppend,
  createSessionUpdate,
  parseServerEvent
} from '../src/main/qwen/protocol'

describe('Qwen realtime protocol', () => {
  it('builds the Beijing workspace endpoint when a workspace ID is present', () => {
    const url = buildRealtimeUrl({
      apiKey: 'sk-test',
      workspaceId: 'llm-test-workspace',
      model: 'qwen3-asr-flash-realtime'
    })

    expect(url).toBe(
      'wss://llm-test-workspace.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime'
    )
  })

  it('uses 16 kHz PCM and balanced server VAD', () => {
    const event = createSessionUpdate()

    expect(event.type).toBe('session.update')
    expect(event.session).toMatchObject({
      modalities: ['text'],
      input_audio_format: 'pcm',
      sample_rate: 16_000,
      turn_detection: {
        type: 'server_vad',
        threshold: 0.2,
        silence_duration_ms: 800
      }
    })
  })

  it('encodes PCM bytes as Base64 audio append events', () => {
    const event = createAudioAppend(new Uint8Array([0, 1, 2, 255]))

    expect(event.type).toBe('input_audio_buffer.append')
    expect(event.audio).toBe('AAEC/w==')
  })

  it('parses partial transcript events from websocket buffers', () => {
    const event = parseServerEvent(
      Buffer.from(
        JSON.stringify({
          type: 'conversation.item.input_audio_transcription.text',
          item_id: 'item-1',
          text: 'Type',
          stash: 'Script'
        })
      )
    )

    expect(event.type).toBe('conversation.item.input_audio_transcription.text')
    expect(`${event.text}${event.stash}`).toBe('TypeScript')
  })
})
