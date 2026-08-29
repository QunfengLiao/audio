export function buildTranscriptText(paragraphs: readonly string[]): string {
  return paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join('\n\n')
}
