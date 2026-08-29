# Windows 与 macOS 双平台运行及打包设计

日期：2026-08-29

## 背景

项目当前能在 macOS 开发环境中采集系统音频、实时转写并保存 Markdown，但发布与交互仍存在明显的 macOS 假设：

- 没有可分发安装包配置，也没有 `.exe` 或 `.dmg` 打包命令。
- 产品说明、设置提示与权限报错写死为 macOS。
- 默认笔记目录使用 `process.cwd()/doc`；应用安装后，当前工作目录可能不可写或不稳定。
- macOS 需要保留现有系统音频兼容开关；Windows 则应使用 Electron 官方支持的 loopback 系统音频采集路径。

目标是在不改变现有转写协议、正文确认逻辑及日期分组格式的前提下，使项目可在 Windows 和 macOS 上运行，并提供两个明确的发布命令。

## 已确认范围

- `npm run package:win` 生成 Windows x64 NSIS 安装程序 `.exe`。
- `npm run package:mac` 生成 Apple Silicon arm64 `.dmg`。
- 两个平台的发布产物统一写入 `release/`。
- 开发环境的默认笔记目录仍为项目内的 `doc`。
- 打包应用的默认笔记目录改为系统“文档”目录下的 `Qwen课堂笔记`。
- NoteWriter 已有的 `YY/M/D` 日期子目录规则保持不变。
- 用户在设置中选择过的笔记目录优先于默认目录，升级后不覆盖。
- 本次不加入代码签名、自动更新、Windows ARM64、Intel Mac 或 Linux 安装包。
- 仓库目前没有正式应用图标，本次允许安装包暂用默认图标；品牌图标作为独立后续工作。

## 方案比较

### 方案 A：electron-builder 本地双平台命令（采用）

在现有 electron-vite 构建之后使用 electron-builder：Windows 输出 NSIS x64 安装器，macOS 输出 arm64 DMG。同步修正平台判断、默认保存路径及界面文案。

优点是改动集中、命令清晰，与当前 Electron 项目结构匹配；也能以后平滑加入签名和 CI。缺点是发布构建仍依赖目标平台工具链：DMG 应在 macOS 上构建，Windows 安装器在 Windows 上构建最可靠；macOS 跨构建 Windows 需要额外的 Wine 或 Docker 环境。

### 方案 B：只添加打包脚本

仅安装 electron-builder 并增加两个命令，不调整运行时与文案。

改动最少，但生成 `.exe` 不代表 Windows 版本真正可用：默认保存目录可能不可写，报错会错误引导 Windows 用户去 macOS 设置，产品标识也不准确。因此不采用。

### 方案 C：直接建立原生 CI 发布矩阵

使用 macOS 与 Windows runner 分别构建两个产物，并预留签名。

发布可重复性最好，但需要确定代码托管平台、密钥与发布流程，超出当前“增加两个本地打包命令”的范围。方案 A 会保留兼容 CI 的配置，后续可单独增加。

## 总体设计

### 1. 构建与打包

保留现有 `npm run build` 作为类型检查和 electron-vite 编译入口，新增 electron-builder 开发依赖及配置：

- `package:win`: 先执行应用构建，再以 `win/nsis/x64` 目标打包。
- `package:mac`: 先执行应用构建，再以 `mac/dmg/arm64` 目标打包。
- 设置稳定的 `appId`、产品名称与显式产物命名，产物中包含 `out/` 编译结果及运行所需依赖。
- 开启 ASAR；源代码、测试、开发文档、现有笔记和 `.env` 不进入安装包。
- macOS `Info.plist` 添加系统音频采集用途说明，为 Electron 的 macOS 音频权限路径提供发布态元数据。
- NSIS 使用可选择安装目录的标准安装向导，并创建开始菜单入口；不添加自动更新。

本地未配置证书时仍可生成未签名包。未签名 `.exe` 可能触发 Windows SmartScreen，未签名/未公证 `.dmg` 可能触发 macOS Gatekeeper；这是分发信任提示，不影响本次功能实现。

### 2. 平台能力与音频采集

主进程继续通过 `setDisplayMediaRequestHandler` 为 `getDisplayMedia` 提供主屏幕视频源和系统音频：

- Windows 使用 `audio: "loopback"`，由 Electron 捕获系统输出音频。
- macOS 继续仅在 `darwin` 下启用现有 `MacCatapLoopbackAudioForScreenShare` 兼容开关，保留当前已验证行为。
- 非 Windows/macOS 平台不宣称支持；若意外运行，应返回明确的“不支持当前系统”错误。
- 渲染进程仍只消费音轨，拿到流后立即停用视频轨道；不会保存或上传屏幕画面。

通过 preload 暴露只读、最小化的平台标识，使界面可以选择正确的品牌副标题、权限说明和错误建议，不开放 Node.js 或 Electron 的任意能力。

### 3. 默认笔记目录

默认路径按运行形态计算：

- 开发态：`<项目目录>/doc`。
- 打包态：`<系统文档目录>/Qwen课堂笔记`。

设置存储仍位于 Electron `userData` 目录，安全密钥继续通过 `safeStorage` 保存。设置中已有的自定义笔记目录保持最高优先级。开始转写后，NoteWriter 在选定根目录下继续创建 `YY/M/D` 子目录。

打包态不从任意 `process.cwd()` 位置加载 `.env`；发布应用以设置页中的 API Key 为主。开发态保留项目 `.env` 回退，便于本地调试。

### 4. 平台化界面与错误

将下列 macOS 专用文字改为平台感知或平台中性：

- 左上角 `System Audio · macOS` 在 Windows 显示 `System Audio · Windows`。
- “密钥由 macOS 安全加密”改为“密钥由系统安全存储加密”。
- Windows 的系统音频失败提示不再指向 macOS“隐私与安全性”，而是提示检查正在播放的音频、应用权限和重新启动。
- macOS 保留“屏幕与系统音频录制”权限指引。
- README 分别说明 Windows 与 macOS 的运行要求、打包命令、产物位置和未签名提示。

### 5. 错误处理

- 找不到屏幕源时，主进程拒绝媒体请求，渲染进程显示可操作错误。
- `getDisplayMedia` 未返回音轨时，根据平台返回对应提示。
- 不支持的平台在尝试开始前失败，不创建空笔记会话。
- 打包命令任一步骤失败即返回非零退出码，不留下“成功”假象。
- 自定义笔记目录不可写时沿用现有写入错误处理，不静默切回默认位置。

## 数据流

1. 用户点击开始转写。
2. 渲染进程读取 preload 暴露的平台标识并校验是否支持。
3. 渲染进程请求 display media；主进程按平台授权主屏幕源与系统 loopback 音频。
4. 渲染进程停用视频轨道，仅将 PCM 音频块发送到主进程。
5. 主进程从设置存储解析 API Key 与笔记根目录，创建转写会话。
6. 已确认正文按既有逻辑写入 `<根目录>/<YY>/<M>/<D>/<文件名>.md`。

## 测试与验收

### 自动测试

- 默认目录解析：开发态使用项目 `doc`，打包态使用系统“文档/Qwen课堂笔记”。
- 平台展示与错误消息：`darwin`、`win32` 和不支持平台分别得到正确结果。
- 打包配置：两个脚本、目标平台、架构、产物目录及 macOS 权限说明存在。
- 保持全部现有转写、设置、复制和 NoteWriter 测试通过。
- 运行 `npm run typecheck`、`npm test`、`npm run build`。

### 产物验证

- 在当前 Apple Silicon Mac 上运行 `npm run package:mac`，确认生成可挂载的 arm64 `.dmg`，应用可启动并打开设置。
- 在 Windows x64 或 Windows CI 上运行 `npm run package:win`，确认生成 NSIS `.exe`，安装、启动、卸载以及系统音频转写可用。
- 若当前 Mac 没有 Wine/Docker，本地只验证 Windows 打包配置与编译，不把缺少 Windows 原生运行验证描述为已验证。

## 完成标准

- 两个命令及对应 electron-builder 配置可用。
- macOS DMG 在当前机器完成实际构建检查。
- Windows 代码路径不存在 macOS 专用阻断，且 Windows 安装包可在 Windows 原生环境构建。
- 发布态默认保存目录可写，日期分组与用户自定义目录行为不回归。
- 界面与 README 不再把产品描述为仅支持 macOS。
