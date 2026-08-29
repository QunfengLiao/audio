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
})
