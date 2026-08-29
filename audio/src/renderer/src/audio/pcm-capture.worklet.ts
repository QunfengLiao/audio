declare const sampleRate: number
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean
}
declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor
): void

class PcmCaptureProcessor extends AudioWorkletProcessor {
  private readonly targetFrames = Math.max(128, Math.round(sampleRate / 10))
  private chunk = new Float32Array(this.targetFrames)
  private offset = 0

  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0]
    const firstChannel = channels?.[0]
    if (!channels || !firstChannel) return true

    for (let frame = 0; frame < firstChannel.length; frame += 1) {
      let mixed = 0
      for (const channel of channels) mixed += channel[frame] ?? 0
      this.chunk[this.offset] = mixed / channels.length
      this.offset += 1

      if (this.offset === this.targetFrames) {
        const completed = this.chunk
        this.port.postMessage(
          { samples: completed, sampleRate },
          [completed.buffer]
        )
        this.chunk = new Float32Array(this.targetFrames)
        this.offset = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor)
