import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveDefaultNoteDirectory } from '../src/main/default-note-directory'

describe('resolveDefaultNoteDirectory', () => {
  it('uses the project doc directory during development', () => {
    expect(
      resolveDefaultNoteDirectory({
        isPackaged: false,
        workingDirectory: '/workspace/audio',
        documentsDirectory: '/Users/test/Documents'
      })
    ).toBe(resolve('/workspace/audio', 'doc'))
  })

  it('uses a user-writable Documents directory in packaged apps', () => {
    expect(
      resolveDefaultNoteDirectory({
        isPackaged: true,
        workingDirectory: '/Applications',
        documentsDirectory: '/Users/test/Documents'
      })
    ).toBe(resolve('/Users/test/Documents', 'Qwen课堂笔记'))
  })
})
