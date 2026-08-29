import { describe, expect, it } from 'vitest'
import {
  calculateRms,
  Pcm16Resampler
} from '../src/renderer/src/audio/pcm-resampler'

describe('Pcm16Resampler', () => {
  it('converts one second of 48 kHz audio to 16 kHz PCM', () => {
    const input = new Float32Array(48_000).fill(0.5)
    const output = new Pcm16Resampler(48_000).process(input)

    expect(output).toHaveLength(16_000)
    expect(output[0]).toBe(16_384)
    expect(output.at(-1)).toBe(16_384)
  })

  it('keeps resampling continuous across worklet chunk boundaries', () => {
    const input = Float32Array.from(
      { length: 9_600 },
      (_, index) => Math.sin((index / 48_000) * Math.PI * 2 * 440)
    )
    const oneShot = new Pcm16Resampler(48_000).process(input)
    const chunkedResampler = new Pcm16Resampler(48_000)
    const first = chunkedResampler.process(input.slice(0, 4_139))
    const second = chunkedResampler.process(input.slice(4_139))
    const chunked = new Int16Array(first.length + second.length)
    chunked.set(first)
    chunked.set(second, first.length)

    expect(Array.from(chunked)).toEqual(Array.from(oneShot))
  })

  it('clamps float samples to signed 16-bit range', () => {
    const output = new Pcm16Resampler(32_000).process(
      new Float32Array([-2, -2, 2, 2])
    )

    expect(Array.from(output)).toEqual([-32_768, 32_767])
  })
})

describe('calculateRms', () => {
  it('returns the root mean square audio level', () => {
    expect(calculateRms(new Float32Array([1, -1, 1, -1]))).toBe(1)
    expect(calculateRms(new Float32Array(0))).toBe(0)
  })
})
