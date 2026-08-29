import workletUrl from './pcm-capture.worklet.ts?worker&url'
import { calculateRms, copyPcmBuffer, Pcm16Resampler } from './pcm-resampler'

export interface CaptureCallbacks {
  onAudio(chunk: ArrayBuffer): void
  onLevel(level: number): void
  onEnded(): void
}

interface WorkletChunk {
  samples: Float32Array
  sampleRate: number
}

export class SystemAudioCapture {
  private audioContext: AudioContext | undefined
  private source: MediaStreamAudioSourceNode | undefined
  private worklet: AudioWorkletNode | undefined
  private silentGain: GainNode | undefined
  private started = false
  private stopping = false

  private constructor(private readonly stream: MediaStream) {}

  static async request(): Promise<SystemAudioCapture> {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: {
        width: { ideal: 16 },
        height: { ideal: 16 },
        frameRate: { ideal: 1, max: 1 }
      }
    })

    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop())
      throw new Error('没有获得系统音频轨道，请检查“屏幕与系统音频录制”权限')
    }

    for (const videoTrack of stream.getVideoTracks()) videoTrack.enabled = false
    return new SystemAudioCapture(stream)
  }

  async start(callbacks: CaptureCallbacks): Promise<void> {
    if (this.started) return

    // Chromium performs its high-quality device-rate conversion before the
    // worklet. The explicit resampler below remains as a compatibility guard.
    const audioContext = new AudioContext({ latencyHint: 'interactive', sampleRate: 16_000 })
    await audioContext.audioWorklet.addModule(workletUrl)

    const source = audioContext.createMediaStreamSource(this.stream)
    const worklet = new AudioWorkletNode(audioContext, 'pcm-capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1]
    })
    const silentGain = audioContext.createGain()
    silentGain.gain.value = 0

    const resampler = new Pcm16Resampler(audioContext.sampleRate)
    worklet.port.onmessage = (event: MessageEvent<WorkletChunk>) => {
      const { samples } = event.data
      callbacks.onLevel(calculateRms(samples))
      const pcm = resampler.process(samples)
      if (pcm.length > 0) callbacks.onAudio(copyPcmBuffer(pcm))
    }

    const handleEnded = (): void => {
      if (!this.stopping) callbacks.onEnded()
    }
    for (const track of this.stream.getTracks()) track.addEventListener('ended', handleEnded)

    source.connect(worklet)
    worklet.connect(silentGain)
    silentGain.connect(audioContext.destination)
    await audioContext.resume()

    this.audioContext = audioContext
    this.source = source
    this.worklet = worklet
    this.silentGain = silentGain
    this.started = true
  }

  async stop(): Promise<void> {
    if (this.stopping) return
    this.stopping = true

    this.worklet?.port.close()
    this.source?.disconnect()
    this.worklet?.disconnect()
    this.silentGain?.disconnect()
    this.stream.getTracks().forEach((track) => track.stop())
    await this.audioContext?.close()
    this.started = false
  }
}
