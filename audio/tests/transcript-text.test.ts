import { describe, expect, it } from 'vitest'
import { buildTranscriptText } from '../src/shared/transcript-text'

describe('buildTranscriptText', () => {
  it('trims finalized paragraphs and separates them with one blank line', () => {
    expect(buildTranscriptText([' 第一段。 ', '第二段。'])).toBe('第一段。\n\n第二段。')
  })

  it('omits empty paragraphs and returns empty text when none remain', () => {
    expect(buildTranscriptText(['', '  ', '\n'])).toBe('')
    expect(buildTranscriptText(['第一段。', ' ', '第二段。'])).toBe('第一段。\n\n第二段。')
  })
})
