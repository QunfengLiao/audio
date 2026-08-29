import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NoteWriter, safeFilename } from '../src/main/notes/note-writer'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('NoteWriter', () => {
  it('creates Markdown and appends only plain transcript paragraphs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'qwen-notes-test-'))
    temporaryDirectories.push(directory)
    const writer = new NoteWriter({
      outputDirectory: directory,
      now: () => new Date(2026, 7, 29, 9, 0, 8)
    })

    const path = writer.create('TypeScript 网课')
    writer.appendParagraph('大家好，我们今天学习 TypeScript。')
    writer.appendParagraph('  首先来看类型系统。  ')

    const expectedDirectory = join(directory, '26', '8', '29')
    expect(path).toBe(join(expectedDirectory, '2026-08-29_09-00-08_TypeScript 网课.md'))
    expect(readFileSync(path, 'utf8')).toBe(
      '# TypeScript 网课\n\n' +
        '- 开始时间：2026-08-29 09:00:08\n' +
        '- 识别模型：qwen3-asr-flash-realtime\n\n' +
        '---\n\n' +
        '大家好，我们今天学习 TypeScript。\n\n' +
        '首先来看类型系统。\n\n'
    )
  })

  it('does not overwrite a note created in the same second', () => {
    const directory = mkdtempSync(join(tmpdir(), 'qwen-notes-test-'))
    temporaryDirectories.push(directory)
    const options = {
      outputDirectory: directory,
      now: () => new Date(2026, 7, 29, 9, 0, 8)
    }

    const first = new NoteWriter(options).create('课程')
    const second = new NoteWriter(options).create('课程')

    const expectedDirectory = join(directory, '26', '8', '29')
    expect(first).toBe(join(expectedDirectory, '2026-08-29_09-00-08_课程.md'))
    expect(second).toBe(join(expectedDirectory, '2026-08-29_09-00-08_课程-2.md'))
  })

  it('removes characters that macOS filenames cannot safely use', () => {
    expect(safeFilename('TypeScript: interface/type?')).toBe('TypeScript- interface-type-')
  })
})
