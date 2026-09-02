import { resolve } from 'node:path'

export interface DefaultNoteDirectoryOptions {
  isPackaged: boolean
  workingDirectory: string
  documentsDirectory: string
}

export function resolveDefaultNoteDirectory(options: DefaultNoteDirectoryOptions): string {
  return options.isPackaged
    ? resolve(options.documentsDirectory, '课迹')
    : resolve(options.workingDirectory, 'doc')
}
