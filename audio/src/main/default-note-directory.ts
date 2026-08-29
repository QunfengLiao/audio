import { resolve } from 'node:path'

export interface DefaultNoteDirectoryOptions {
  isPackaged: boolean
  workingDirectory: string
  documentsDirectory: string
}

export function resolveDefaultNoteDirectory(options: DefaultNoteDirectoryOptions): string {
  return options.isPackaged
    ? resolve(options.documentsDirectory, 'Qwen课堂笔记')
    : resolve(options.workingDirectory, 'doc')
}
