import { describe, expect, it, vi } from 'vitest'
import { writeTranscriptToClipboard } from '../src/main/clipboard-writer'

describe('writeTranscriptToClipboard', () => {
  it('writes finalized transcript text unchanged', () => {
    const writeText = vi.fn()

    writeTranscriptToClipboard('第一段。\n\n第二段。', writeText)

    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledWith('第一段。\n\n第二段。')
  })

  it.each([undefined, 42, '', '   '])('rejects an empty or non-string payload: %s', (value) => {
    const writeText = vi.fn()

    expect(() => writeTranscriptToClipboard(value, writeText)).toThrow('没有可复制的正文')
    expect(writeText).not.toHaveBeenCalled()
  })
})
