import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface TargetConfiguration {
  target: string
  arch: string[]
}

interface PackageManifest {
  name: string
  scripts: Record<string, string>
  devDependencies: Record<string, string>
  build: {
    appId: string
    productName: string
    directories: { output: string }
    files: string[]
    mac: {
      target: TargetConfiguration[]
      extendInfo: Record<string, string>
    }
    win: { target: TargetConfiguration[] }
    nsis: {
      oneClick: boolean
      allowToChangeInstallationDirectory: boolean
    }
  }
}

const manifest = JSON.parse(
  readFileSync(resolve('package.json'), 'utf8')
) as PackageManifest

describe('desktop packaging configuration', () => {
  it('provides explicit Windows EXE and macOS DMG commands', () => {
    expect(manifest.scripts['package:win']).toBe(
      'npm run build && electron-builder --win nsis --x64'
    )
    expect(manifest.scripts['package:mac']).toBe(
      'npm run build && electron-builder --mac dmg --arm64'
    )
    expect(manifest.devDependencies['electron-builder']).toBe('26.15.3')
  })

  it('builds Windows x64 with NSIS and macOS arm64 with DMG', () => {
    expect(manifest.name).toBe('keji-course-notes')
    expect(manifest.build.appId).toBe('com.keji.coursenotes')
    expect(manifest.build.productName).toBe('课迹')
    expect(manifest.build.directories.output).toBe('release')
    expect(manifest.build.files).toContain('out/**/*')
    expect(manifest.build.win.target).toEqual([{ target: 'nsis', arch: ['x64'] }])
    expect(manifest.build.mac.target).toEqual([{ target: 'dmg', arch: ['arm64'] }])
    expect(manifest.build.nsis).toMatchObject({
      oneClick: false,
      allowToChangeInstallationDirectory: true
    })
  })

  it('declares the macOS system-audio usage description', () => {
    expect(manifest.build.mac.extendInfo.NSAudioCaptureUsageDescription).toContain(
      '系统音频'
    )
  })
})
