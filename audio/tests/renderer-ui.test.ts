import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const html = readFileSync(resolve('src/renderer/index.html'), 'utf8')
const css = readFileSync(resolve('src/renderer/src/styles.css'), 'utf8')

describe('transcript renderer UI', () => {
  it('includes a disabled copy-all button beside document metadata', () => {
    expect(html).toMatch(/id="copyAllButton"[^>]*disabled/)
    expect(html).toContain('id="copyButtonLabel"')
    expect(html).toContain('复制全部')
  })

  it('does not cap transcript paragraphs at 720px', () => {
    const transcriptRules = css.slice(
      css.indexOf('.final-transcript p,'),
      css.indexOf('.workspace-footer')
    )
    expect(transcriptRules).not.toContain('max-width: 720px')
    expect(transcriptRules).toContain('width: 100%')
    expect(transcriptRules).toContain('overflow-wrap: anywhere')
  })

  it('provides platform-aware labels without Mac-only storage wording', () => {
    expect(html).toContain('id="platformLabel"')
    expect(html).toContain('id="revealButtonLabel"')
    expect(html).toContain('id="directoryPickerHint"')
    expect(html).toContain('id="switchShortcutKey"')
    expect(html).toContain('密钥由系统安全存储加密')
    expect(html).toContain('原文保存在这台电脑上')
    expect(html).not.toContain('原文保存在这台 Mac 上')
    expect(html).not.toContain('密钥由 macOS 安全加密')
  })
})
