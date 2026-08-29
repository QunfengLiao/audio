export type RuntimePlatform = 'darwin' | 'win32' | 'unsupported'

export interface PlatformPresentation {
  brandLabel: string
  revealButtonLabel: string
  directoryPickerHint: string
  applicationSwitchModifier: string
  missingAudioTrackMessage: string
  permissionDeniedMessage: string
  unsupportedMessage: string
}

const presentations: Record<RuntimePlatform, PlatformPresentation> = {
  darwin: {
    brandLabel: 'System Audio · macOS',
    revealButtonLabel: '在 Finder 中显示',
    directoryPickerHint: '可随时在 Finder 中选择其他文件夹',
    applicationSwitchModifier: '⌘',
    missingAudioTrackMessage: '没有获得系统音频轨道，请检查“屏幕与系统音频录制”权限',
    permissionDeniedMessage:
      '系统音频权限被拒绝。请在“系统设置 → 隐私与安全性 → 屏幕与系统音频录制”中允许本应用，然后重启应用。',
    unsupportedMessage: '当前 macOS 版本暂不支持系统音频转写'
  },
  win32: {
    brandLabel: 'System Audio · Windows',
    revealButtonLabel: '在文件资源管理器中显示',
    directoryPickerHint: '可随时在文件资源管理器中选择其他文件夹',
    applicationSwitchModifier: 'Alt',
    missingAudioTrackMessage: '没有获得系统音频轨道，请确认电脑正在播放声音，然后重启应用',
    permissionDeniedMessage:
      '系统音频访问被拒绝。请检查 Windows 隐私设置和应用权限，然后重启应用。',
    unsupportedMessage: '当前 Windows 版本暂不支持系统音频转写'
  },
  unsupported: {
    brandLabel: 'System Audio · Unsupported',
    revealButtonLabel: '显示文件位置',
    directoryPickerHint: '可随时选择其他文件夹',
    applicationSwitchModifier: 'Alt',
    missingAudioTrackMessage: '当前系统暂不支持系统音频转写',
    permissionDeniedMessage: '当前系统暂不支持系统音频转写',
    unsupportedMessage: '当前系统暂不支持系统音频转写，仅支持 Windows 和 macOS。'
  }
}

export function normalizeRuntimePlatform(value: string): RuntimePlatform {
  if (value === 'darwin' || value === 'win32') return value
  return 'unsupported'
}

export function isSupportedRuntimePlatform(platform: RuntimePlatform): boolean {
  return platform === 'darwin' || platform === 'win32'
}

export function getPlatformPresentation(platform: RuntimePlatform): PlatformPresentation {
  return presentations[platform]
}
