# 课迹 · 网课实时笔记

> 听见课程，落成笔记。一堂课，一份完整记录。

一个支持 Windows 和 macOS 的 Electron + TypeScript 小工具：采集电脑当前播放的系统声音，使用阿里云百炼 `qwen3-asr-flash-realtime` 实时转写，并把最终确认的原文逐段写入 Markdown。

## 环境要求

- Windows 10/11 x64，或 macOS 13 及更高版本（Apple Silicon）
- Node.js 20 或更高版本
- 中国北京区域的阿里云百炼 API Key

## 安装与启动

```bash
npm install
npm run dev
```

首次启动后，点击主界面右上角的齿轮按钮打开“设置”：

1. 填写 DashScope API Key。密钥会由操作系统安全存储加密后保存在应用数据目录中，不会回传到页面。
2. 按需点击“选择文件夹”，设置之后新笔记的保存位置。
3. 点击“保存设置”。设置会在下一次开始转写时生效。

转写进行期间设置入口会被禁用，已经生成的笔记不会因更改目录而移动。

### `.env` 开发兼容配置

开发模式下，应用内没有保存 API Key 时，仍会读取项目根目录的 `.env`：

```dotenv
DASHSCOPE_API_KEY=sk-你的密钥
```

可以从示例文件开始：

```bash
cp .env.example .env
```

如果你知道百炼工作空间 ID，建议一并填写，以使用当前推荐的专属域名：

```dotenv
DASHSCOPE_WORKSPACE_ID=你的工作空间ID
```

不填写工作空间 ID 时，程序使用仍受支持的北京旧版 WebSocket 域名。也可以用 `DASHSCOPE_WS_URL` 明确覆盖地址。

打包后的应用不会从启动目录读取 `.env`，请通过应用设置页保存 API Key。

## 使用

1. 输入课程标题。
2. 点击“开始转写”。
3. macOS 首次运行时，允许“屏幕与系统音频录制”权限；Windows 会直接采集系统输出声音。
4. 播放网课；页面会显示临时字幕，最终确认的句子会即时写入文件。
5. 点击“停止”，等待最后一句完成。
6. 有最终确认的内容后，可点击文档栏中的“复制全部”。剪贴板只包含正文段落，不包含标题、时间、模型或仍在变化的临时字幕。

默认保存位置：

- 开发模式：项目的 `doc/` 目录。
- 安装后的应用：系统“文档”目录中的 `课迹` 文件夹。
- 自定义位置：设置页中选择的文件夹。

所有位置都会按会话开始日期创建 `YY/M/D/` 子目录，例如：

```text
doc/26/8/29/2026-08-29_09-00-08_TypeScript 网课.md
```

已有的 `notes/` 或 `doc/` 文件不会自动迁移。

文件内容不包含句内时间戳：

```markdown
# TypeScript 网课

- 开始时间：2026-08-29 09:00:08
- 识别模型：qwen3-asr-flash-realtime

---

大家好，我们今天学习 TypeScript。

首先来看类型系统。
```

## 打包

### Windows x64 安装程序

在 Windows x64 上运行：

```bash
npm run package:win
```

输出文件：

```text
release/Keji-Course-Notes-1.0.0-x64-Setup.exe
```

这是带安装向导的 NSIS 安装程序，可选择安装目录，并创建桌面与开始菜单快捷方式。从 macOS 跨平台生成该安装程序需要额外安装 Wine，或使用带 Wine 的 Docker 构建环境。

### macOS Apple Silicon 安装镜像

在 Apple Silicon Mac 上运行：

```bash
npm run package:mac
```

输出文件：

```text
release/Keji-Course-Notes-1.0.0-arm64.dmg
```

本地未配置开发者证书时会生成未签名产物。未签名 `.exe` 可能触发 Windows SmartScreen，未签名且未公证的 `.dmg` 可能触发 macOS Gatekeeper；正式公开分发前应分别配置 Authenticode 签名和 Apple Developer ID 签名、公证。

## 权限排查

### Windows

如果没有获得系统音频轨道或音量条始终不动：

1. 确认课程正在播放，并且系统输出设备能够正常发声。
2. 完全退出应用后重新启动。
3. 检查 Windows 隐私设置和应用权限。

### macOS

如果页面有音轨但音量条始终不动：

1. 打开“系统设置 → 隐私与安全性 → 屏幕与系统音频录制”。
2. 允许课迹；开发模式下允许 Electron 或启动它的终端应用。
3. 完全退出正在运行的应用，再重新启动。

应用只采集系统播放声音，不使用麦克风，也不会保存屏幕画面或把原始音频写入磁盘。API Key 只存在于 Electron 主进程；通过设置保存时会由系统安全存储加密，渲染页面只能获知“是否已配置”，无法读取密钥内容。

## 开发命令

```bash
npm test
npm run typecheck
npm run build
```

自动测试覆盖 PCM 降采样、Qwen WebSocket 事件、断线重连、Markdown 落盘、平台提示、默认保存目录与打包配置。系统音频权限仍需在目标操作系统上手动验收。
