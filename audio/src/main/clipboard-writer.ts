export function writeTranscriptToClipboard(
  value: unknown,
  writeText: (text: string) => void
): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('没有可复制的正文')
  }
  writeText(value)
}
