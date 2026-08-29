import { describe, expect, it } from 'vitest'
import {
  getPlatformPresentation,
  isSupportedRuntimePlatform,
  normalizeRuntimePlatform
} from '../src/shared/runtime-platform'

describe('runtime platform', () => {
  it('normalizes macOS and Windows while rejecting unsupported systems', () => {
    expect(normalizeRuntimePlatform('darwin')).toBe('darwin')
    expect(normalizeRuntimePlatform('win32')).toBe('win32')
    expect(normalizeRuntimePlatform('linux')).toBe('unsupported')
  })

  it('marks only macOS and Windows as supported', () => {
    expect(isSupportedRuntimePlatform('darwin')).toBe(true)
    expect(isSupportedRuntimePlatform('win32')).toBe(true)
    expect(isSupportedRuntimePlatform('unsupported')).toBe(false)
  })

  it('provides Windows-specific labels and error guidance', () => {
    const presentation = getPlatformPresentation('win32')

    expect(presentation.brandLabel).toContain('Windows')
    expect(presentation.revealButtonLabel).toContain('文件资源管理器')
    expect(presentation.applicationSwitchModifier).toBe('Alt')
    expect(presentation.permissionDeniedMessage).toContain('Windows')
    expect(presentation.permissionDeniedMessage).not.toContain('macOS')
  })

  it('keeps the existing macOS permission guidance', () => {
    const presentation = getPlatformPresentation('darwin')

    expect(presentation.brandLabel).toContain('macOS')
    expect(presentation.revealButtonLabel).toContain('Finder')
    expect(presentation.applicationSwitchModifier).toBe('⌘')
    expect(presentation.permissionDeniedMessage).toContain('屏幕与系统音频录制')
  })
})
