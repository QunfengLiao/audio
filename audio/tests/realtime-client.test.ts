import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { WebSocketServer } from 'ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QwenRealtimeClient } from '../src/main/qwen/realtime-client'

const servers: WebSocketServer[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) {
    for (const client of server.clients) client.terminate()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

describe('QwenRealtimeClient', () => {
  it('configures a session, sends audio, receives transcripts, and finishes cleanly', async () => {
    const server = await createServer()
    const receivedTypes: string[] = []
    let receivedAudio = ''
    let authorization = ''

    server.on('connection', (socket, request) => {
      authorization = request.headers.authorization ?? ''
      socket.on('message', (raw) => {
        const event = JSON.parse(raw.toString()) as { type: string; audio?: string }
        receivedTypes.push(event.type)
        if (event.type === 'session.update') {
          socket.send(JSON.stringify({ type: 'session.updated' }))
        }
        if (event.type === 'input_audio_buffer.append') {
          receivedAudio = event.audio ?? ''
          socket.send(
            JSON.stringify({
              type: 'conversation.item.input_audio_transcription.text',
              item_id: 'item-1',
              text: '你好',
              stash: '，同学们'
            })
          )
          socket.send(
            JSON.stringify({
              type: 'conversation.item.input_audio_transcription.completed',
              item_id: 'item-1',
              transcript: '你好，同学们。'
            })
          )
        }
        if (event.type === 'session.finish') {
          socket.send(JSON.stringify({ type: 'session.finished' }))
        }
      })
    })

    const onPartial = vi.fn()
    const onFinal = vi.fn()
    const client = makeClient(server, { onPartial, onFinal })

    await client.connect()
    client.appendAudio(new Uint8Array([1, 2, 3]))
    await waitUntil(() => onFinal.mock.calls.length === 1)
    await client.finish()

    expect(authorization).toBe('Bearer sk-test')
    expect(receivedTypes).toEqual([
      'session.update',
      'input_audio_buffer.append',
      'session.finish'
    ])
    expect(receivedAudio).toBe('AQID')
    expect(onPartial).toHaveBeenCalledWith('item-1', '你好，同学们')
    expect(onFinal).toHaveBeenCalledWith('item-1', '你好，同学们。')
  })

  it('buffers audio while reconnecting and sends it on the new session', async () => {
    const server = await createServer()
    let connectionCount = 0
    let audioReceivedOnSecondConnection = false
    const statuses: string[] = []

    server.on('connection', (socket) => {
      connectionCount += 1
      const thisConnection = connectionCount
      socket.on('message', (raw) => {
        const event = JSON.parse(raw.toString()) as { type: string }
        if (event.type === 'session.update') {
          socket.send(JSON.stringify({ type: 'session.updated' }))
          if (thisConnection === 1) setTimeout(() => socket.close(), 5)
        }
        if (event.type === 'input_audio_buffer.append' && thisConnection === 2) {
          audioReceivedOnSecondConnection = true
        }
        if (event.type === 'session.finish') {
          socket.send(JSON.stringify({ type: 'session.finished' }))
        }
      })
    })

    const client = makeClient(server, {
      onStatus: (_phase, message) => statuses.push(message),
      retryDelaysMs: [5, 10, 20]
    })
    await client.connect()
    await waitUntil(() => statuses.some((status) => status.includes('第 1/3 次重连')))
    client.appendAudio(new Uint8Array([9, 8, 7]))
    await waitUntil(() => audioReceivedOnSecondConnection)
    await client.finish()

    expect(connectionCount).toBe(2)
    expect(audioReceivedOnSecondConnection).toBe(true)
  })

  it('waits for the previous socket to close before starting the next session', async () => {
    const server = await createServer()
    let connectionCount = 0
    let liveSocket: import('ws').WebSocket | undefined

    server.on('connection', (socket) => {
      connectionCount += 1
      if (liveSocket) {
        socket.close(1013, 'previous session is still closing')
        return
      }

      liveSocket = socket
      socket.on('close', () => {
        if (liveSocket === socket) liveSocket = undefined
      })
      socket.on('message', (raw) => {
        const event = JSON.parse(raw.toString()) as { type: string }
        if (event.type === 'session.update') {
          socket.send(JSON.stringify({ type: 'session.updated' }))
        }
        if (event.type === 'session.finish') {
          socket.send(JSON.stringify({ type: 'session.finished' }))
        }
      })
    })

    const first = makeClient(server, { closeTimeoutMs: 1_000 })
    await first.connect()
    await first.finish()

    const second = makeClient(server, { closeTimeoutMs: 1_000 })
    await second.connect()
    await second.finish()

    expect(connectionCount).toBe(2)
  })

  it('includes the server close code and reason when readiness fails', async () => {
    const server = await createServer()
    let connectionCount = 0
    server.on('connection', (socket) => {
      connectionCount += 1
      socket.close(1008, 'invalid session configuration')
    })

    const client = makeClient(server)
    await expect(client.connect()).rejects.toThrow(
      'WebSocket 在会话就绪前关闭（code=1008，reason=invalid session configuration）'
    )
    expect(connectionCount).toBe(1)
  })

  it('retries capacity throttling while establishing the initial session', async () => {
    const server = await createServer()
    let connectionCount = 0
    const statuses: string[] = []

    server.on('connection', (socket) => {
      connectionCount += 1
      if (connectionCount < 3) {
        socket.close(
          1011,
          'Too many requests. Your requests are being throttled due to system capacity limits.'
        )
        return
      }

      socket.on('message', (raw) => {
        const event = JSON.parse(raw.toString()) as { type: string }
        if (event.type === 'session.update') {
          socket.send(JSON.stringify({ type: 'session.updated' }))
        }
        if (event.type === 'session.finish') {
          socket.send(JSON.stringify({ type: 'session.finished' }))
        }
      })
    })

    const client = makeClient(server, {
      initialRetryDelaysMs: [5, 10],
      onStatus: (_phase, message) => statuses.push(message)
    })
    await client.connect()
    await client.finish()

    expect(connectionCount).toBe(3)
    expect(statuses).toContain('千问服务繁忙，5 毫秒后自动重试（1/2）…')
    expect(statuses).toContain('千问服务繁忙，10 毫秒后自动重试（2/2）…')
  })
})

async function createServer(): Promise<WebSocketServer> {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  servers.push(server)
  await once(server, 'listening')
  return server
}

function makeClient(
  server: WebSocketServer,
  overrides: {
    onPartial?: (itemId: string, text: string) => void
    onFinal?: (itemId: string, text: string) => void
    onStatus?: (phase: string, message: string) => void
    retryDelaysMs?: readonly number[]
    initialRetryDelaysMs?: readonly number[]
    closeTimeoutMs?: number
  } = {}
): QwenRealtimeClient {
  const address = server.address() as AddressInfo
  return new QwenRealtimeClient({
    url: `ws://127.0.0.1:${address.port}/realtime?model=test`,
    apiKey: 'sk-test',
    retryDelaysMs: overrides.retryDelaysMs,
    initialRetryDelaysMs: overrides.initialRetryDelaysMs,
    connectionTimeoutMs: 1_000,
    finishTimeoutMs: 1_000,
    closeTimeoutMs: overrides.closeTimeoutMs,
    callbacks: {
      onPartial: overrides.onPartial ?? (() => undefined),
      onFinal: overrides.onFinal ?? (() => undefined),
      onStatus: (phase, message) => overrides.onStatus?.(phase, message),
      onWarning: () => undefined,
      onFatal: () => undefined
    }
  })
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1_500): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('等待测试条件超时')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
