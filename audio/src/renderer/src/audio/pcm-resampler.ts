export class Pcm16Resampler {
  private pending = new Float32Array(0)
  private position = 0
  private readonly ratio: number

  constructor(
    readonly inputSampleRate: number,
    readonly outputSampleRate = 16_000
  ) {
    if (inputSampleRate <= 0 || outputSampleRate <= 0) {
      throw new Error('采样率必须大于 0')
    }
    if (outputSampleRate > inputSampleRate) {
      throw new Error('当前音频转换器只支持降采样')
    }
    this.ratio = inputSampleRate / outputSampleRate
  }

  process(input: Float32Array): Int16Array {
    if (input.length === 0) return new Int16Array(0)

    const samples = new Float32Array(this.pending.length + input.length)
    samples.set(this.pending)
    samples.set(input, this.pending.length)

    const values: number[] = []
    while (this.position + 1 < samples.length) {
      const leftIndex = Math.floor(this.position)
      const fraction = this.position - leftIndex
      const left = samples[leftIndex] ?? 0
      const right = samples[leftIndex + 1] ?? left
      values.push(left + (right - left) * fraction)
      this.position += this.ratio
    }

    // Keep the last available source sample so interpolation stays continuous
    // even when an arbitrary chunk boundary falls between output samples.
    const consumed = Math.min(Math.floor(this.position), samples.length - 1)
    this.pending = samples.slice(consumed)
    this.position -= consumed

    const output = new Int16Array(values.length)
    for (let index = 0; index < values.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, values[index] ?? 0))
      output[index] = Math.round(sample < 0 ? sample * 32_768 : sample * 32_767)
    }
    return output
  }
}

export function calculateRms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (const sample of samples) sum += sample * sample
  return Math.sqrt(sum / samples.length)
}

export function copyPcmBuffer(samples: Int16Array): ArrayBuffer {
  const copy = new Uint8Array(samples.byteLength)
  copy.set(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength))
  return copy.buffer
}
