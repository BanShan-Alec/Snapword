# Changelog

## v1.13.2

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.13.1...v1.13.2)

### 🩹 缺陷修复 (Bug Fixes)

- **docs:** 修复根滚动条轨道色与侧栏滚动条占宽问题 ([#81](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/81))
- **docs:** 根滚动条轨道顶部对齐 Header 带底色 ([#84](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/84))
- **docs:** 修复 minimal 布局页根滚动条轨道色缝 ([#87](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/87))

### 💅 代码重构 (Refactoring)

- **renderer:** 统一请求层点分契约并消除过度设计 ([#85](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/85))

### 📖 文档更新 (Documentation)

- **site:** 模板页重写为「使用此模板」AI 任务书并迁移 slug ([#82](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/82))
- **site:** 审校整改文档站过时表述与导航标题不一致 ([#86](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/86))
- **site:** 重写「使用此模板」并迁移 README 截图至 .github/assets ([#83](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/83))

### ❤️ Contributors

- 半山Alec ([@BanShan-Alec](https://github.com/BanShan-Alec))

## v1.13.1

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.13.0...v1.13.1)

### 📖 文档更新 (Documentation)

- **agents:** 解耦 AGENTS.md 文档站依赖并增补模板裁剪蓝图 ([#79](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/79))

### 🤖 持续集成 (CI/CD)

- **release:** 正文首行增加 CHANGELOG 导航链接

### ❤️ Contributors

- Wengzehua ([@BanShan-Alec](https://github.com/BanShan-Alec))
- 半山Alec ([@BanShan-Alec](https://github.com/BanShan-Alec))

## v1.13.0

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.12.1...v1.13.0)

### 🚀 新增特性 (Features)

- **compiler:** 全面适配 React Compiler 规范并升级 Biome 至 2.6 ([#76](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/76))
- **docs:** 重构 mermaid 图预览与放大交互，统一文档写作规范 ([#77](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/77))

### 📖 文档更新 (Documentation)

- **agents:** 按七维度规范重构全仓 AGENTS.md 规则体系 ([#75](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/75))

### ❤️ Contributors

- 半山Alec ([@BanShan-Alec](https://github.com/BanShan-Alec))

## v1.12.1

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.12.0...v1.12.1)

### 💅 代码重构 (Refactoring)

- **assets:** 收敛 logo 资产来源与命名 ([#72](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/72))

### 📖 文档更新 (Documentation)

- **all:** 全站文档极简速查清单重构与代码单一真源对齐 ([#73](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/73))

### ❤️ Contributors

- 半山Alec ([@BanShan-Alec](https://github.com/BanShan-Alec))

## v1.12.0

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.11.1...v1.12.0)

### 🚀 新增特性 (Features)

- **docs:** 文档站迁移 VitePress → Vocs 并接通 GitHub Pages 部署 ([#58](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/58))
- **docs:** 解法清单重构为 9 维度 47 个独立解法页 ([#60](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/60))
- **renderer:** 开启 React Compiler（oxc 路线）并清理冗余 useCallback ([#61](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/61))
- **docs:** 新增前言章节并仿 vocs.dev 改造首页 ([#62](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/62))
- **renderer:** 设计体系整改（cssVar 单源 + 可读性 + 卡片与规范门禁） ([#66](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/66))
- **window:** 首次关闭时确认窗口/应用行为 ([#67](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/67))
- **renderer:** 交互体验增强与全仓测试整改（含文档站构建改造） ([#68](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/68))

### 🩹 缺陷修复 (Bug Fixes)

- **docs:** 移除 accentColor 覆盖，回归 Vocs 默认主题 ([#59](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/59))
- **build:** electron 镜像限定在 postinstall，修复 macOS DMG 打包下载 dmgbuild 404 ([#71](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/71))

### 💅 代码重构 (Refactoring)

- **dx:** ⚠️ 根命令对齐 electron-vite ([#69](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/69))

### 📖 文档更新 (Documentation)

- 重构根 README 并修正文档站滚动条与 Ask AI 细节 ([#65](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/65))

### 🏡 工程维护 (Chores)

- Electron 二进制兜底简化为 postinstall 一行 install-electron ([#64](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/64))

### ⚠️ 行为变更

- **BREAKING CHANGE：根命令对齐 electron-vite**（[#69](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/69)）：`pnpm start` 语义翻转，现在等价于 `pnpm preview`（生产预览），开发态请改用 `pnpm dev`；`pnpm start:dist` 已删除，改用 `pnpm preview`；`build:dir` 更名为 `build:unpack`，`build:app` 已删除（按平台改用 `build:win` / `build:mac` / `build:linux`）。
- **工具链要求 pnpm ≥ 12**（[#63](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/63)）：`engines.pnpm` 提升为 `^12.0.0`、`packageManager` 钉 `pnpm@12.15.0`，pnpm 配置迁至 `pnpm-workspace.yaml`；pnpm 10 会被 engines 拒绝执行脚本，升级前请 `corepack enable` 或安装 pnpm 12。

### ❤️ Contributors

- 半山Alec ([@BanShan-Alec](https://github.com/BanShan-Alec))

## v1.11.1

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.11.0...v1.11.1)

### 🩹 缺陷修复 (Bug Fixes)

- **updater:** 更新失败按语义码分类并补主进程错误日志 ([#54](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/54))

### 💅 代码重构 (Refactoring)

- **renderer:** 渲染日志排障链路补强收尾 ([#55](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/55))

### 🏡 工程维护 (Chores)

- **ci:** OCR 升级 v1.13.3，限并发适配 429 ([#56](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/56))

### ❤️ Contributors

- 半山Alec <627649674@qq.com>

## v1.11.0

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.10.0...v1.11.0)

### 💅 代码重构 (Refactoring)

- **config:** ConfigStore 存储引擎改用 electron-store 并以 Zod 为单一真源 ([#52](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/52))

### ⚠️ 行为变更

- **BREAKING CHANGE**：配置改存 `userData/config.json`（electron-store 引擎，读盘由 Zod 整体校验），旧 `app-config.json` 不再读取；升级后首次启动用户设置重置为默认值，旧文件可手动删除。

### ❤️ Contributors

- 半山Alec <627649674@qq.com>

## v1.10.0

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.9.1...v1.10.0)

### 💅 代码重构 (Refactoring)

- **window:** 主窗口状态改用官方 windowStatePersistence ([#50](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/50))

### 📦 构建与依赖 (Build & Deps)

- **deps:** Electron 升级至 45.0.0（Chromium 156 / Node 24.22）([#49](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/49))

### ⚠️ 行为变更

- 主窗口状态改存 Chromium `Local State`，旧 `window-state.json` 不再读取；升级后首次启动会重置窗口布局。
- Windows 分数缩放（125%/150%/175%）下官方持久化每次启动可能漂移 1–2px，见上游 [electron/electron#55245](https://github.com/electron/electron/issues/55245)。

### ❤️ Contributors

- 半山Alec <627649674@qq.com>

## v1.9.1

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.9.0...v1.9.1)

### 💅 代码重构 (Refactoring)

- **config:** 统一应用身份、构建期与运行时常量来源 ([#45](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/45))
- **config:** 精简构建辅助模块并调整主进程外置策略 ([#46](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/46))
- **build:** 拆分 build/lib 并移除配置副作用 ([#47](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/47))

### ❤️ Contributors

- 半山Alec ([@BanShan-Alec](https://github.com/BanShan-Alec))

## v1.9.0

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.8.0...v1.9.0)

### 🚀 新增特性 (Features)

- **renderer:** Tailwind 升级至 v4 并接入官方 Vite 插件 ([#43](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/43))

### ❤️ Contributors

- 半山Alec ([@BanShan-Alec](https://github.com/BanShan-Alec))

## v1.8.0

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.7.0...v1.8.0)

### 🚀 新增特性 (Features)

- **lifecycle:** 补充渲染窗口启动生命周期日志并消除更新窗口白屏闪烁 ([#41](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/41))

### ❤️ Contributors

- 半山Alec <627649674@qq.com>

## v1.7.0

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.6.0...v1.7.0)

### 🚀 新增特性 (Features)

- **logging:** 渲染进程新增全局 logger API 并加固落盘管道 ([#37](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/37))
- **template:** 支持零配置打包、动态应用标识、补充 License 与定制指南 ([#34](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/34))

### 🩹 缺陷修复 (Bug Fixes)

- **ota:** 规整打包产物命名规范并打通主进程 OTA 异常 Sentry 监控 ([#38](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/38))

### ❤️ Contributors

- 半山Alec ([@BanShan-Alec](https://github.com/BanShan-Alec))

## v1.6.0

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.5.0...v1.6.0)

### 🚀 新增特性 (Features)

- **window:** 主窗口初始尺寸自适应高缩放比屏幕并实现任务栏工作区视觉居中 ([#35](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/35))

### ❤️ Contributors

- 半山Alec <627649674@qq.com>

## v1.5.0

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.4.0...v1.5.0)

### 🚀 新增特性 (Features)

- **renderer:** 主窗口接入 wouter 路由管理与 CSP 安全配置 ([#32](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/32))

### ❤️ Contributors

- 半山Alec ([@BanShan-Alec](https://github.com/BanShan-Alec))

## v1.4.0

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.3.1...v1.4.0)

### 🚀 新增特性 (Features)

- **tray:** 关闭到托盘时销毁主窗口以释放内存 ([#29](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/29))

### ❤️ Contributors

- 半山Alec ([@BanShan-Alec](https://github.com/BanShan-Alec))

## v1.3.1

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.3.0...v1.3.1)

### 🩹 缺陷修复 (Bug Fixes)

- **sentry:** 支持 .env 兜底解析组织与项目名，允许 @sentry/cli 依赖构建 ([#27](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/27))

### ❤️ Contributors

- 半山Alec ([@BanShan-Alec](https://github.com/BanShan-Alec))

## v1.3.0

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.2.0...v1.3.0)

### 🚀 新增特性 (Features)

- **telemetry:** 实现 Mini-OTel 轻量遥测系统与多窗口独立日志落盘 ([#23](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/23))
- **assets:** 统一多平台应用图标并设计全新安装包矢量图标 ([#25](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/25))

### 💅 代码重构 (Refactoring)

- **sentry:** 重构监控方案为 @sentry/electron 轻量内联模式并接入 CI ([#21](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/21))

### 🤖 持续集成 (CI/CD)

- **ocr:** 优化增量代码审查与手动触发机制 ([#24](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/24))

### ❤️ Contributors

- 半山Alec ([@BanShan-Alec](https://github.com/BanShan-Alec))

## v1.2.0

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.1.1...v1.2.0)

### 🚀 新增特性 (Features)

- **ci:** 增加 pr:merge 安全确认守卫并更新面向 AI 的 SOP 规范 ([2494b15](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/2494b15))

### ⚡ 性能优化 (Performance)

- **build:** 缩减 asar 打包体积，去除内联 sourcemap 并剔除冗余依赖 ([#19](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/19))

### 🤖 持续集成 (CI/CD)

- Release 页中文标题与 CHANGELOG 导航 ([712d475](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/712d475))

### ❤️ Contributors

- Wengzehua ([@BanShan-Alec](https://github.com/BanShan-Alec))
- 半山Alec ([@BanShan-Alec](https://github.com/BanShan-Alec))

## v1.1.1

[compare changes](https://github.com/BanShan-Alec/electron-react-monorepo-template/compare/v1.1.0...v1.1.1)

### 🩹 缺陷修复 (Bug Fixes)

- **main:** 崩溃监听前移至首个 import，接住 import 期异常 ([#17](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/17))

### ❤️ Contributors

- 半山Alec <627649674@qq.com>

## v1.1.0

### 🚀 新增特性 (Features)

- 初始化项目首次提交 (v1.0.0) ([7b340e6](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/7b340e6))
- 修复主界面滚动并接入系统级主题与平台原生滚动条 ([78d7e1a](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/78d7e1a))
- **renderer:** 接入 Sentry 错误上报并收窄 SourceMap 泄露面 ([1774746](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/1774746))
- **settings:** 修复偏好设置全链路缺陷并集成 LinguiJS 中文优先国际化架构 ([e7eb666](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/e7eb666))
- **shared:** 新增窗口身份定义与更新模块 IPC 类型契约 ([d854f72](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/d854f72))
- **main:** 引入窗口注册中心并规范主窗口更名与生命周期管理 ([12d1e75](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/12d1e75))
- **main:** 实现自动更新状态机服务与独立更新窗口模块 ([3431a85](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/3431a85))
- **main:** 接通托盘检查更新入口并增强外链安全校验 ([bc1d53e](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/bc1d53e))
- **preload:** 暴露 updater 命名空间与安全外链调用能力 ([2c54c9c](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/2c54c9c))
- **renderer:** 抽取 AppProviders 并实现独立更新窗口与功能组件 ([9841465](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/9841465))
- **renderer:** 设置页增加检查更新入口并提取多语言词条 ([8d9724e](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/8d9724e))
- **i18n:** 补全所有业务模块与主进程通知的多语言适配 ([86b676b](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/86b676b))
- **renderer:** 引入 @ant-design/icons 统一卡片图标并优化紧凑按钮尺寸规范 ([e8f7f98](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/e8f7f98))
- **devtools:** 增加非白名单外链安全拦截演示与多语言支持 ([bb09780](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/bb09780))
- **scripts:** 抽离 port-guard 模块并实现开发环境端口占用交互式清理与子进程树强杀 ([bc193cc](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/bc193cc))
- **renderer:** 基于 CSS Custom Highlight API 实现代码片段高亮并在 ArchitectureView 中应用 ([3c1194f](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/3c1194f))
- **window:** 接入 WCO 原生窗口控件叠加层并按平台适配标题栏避让与主题联动 ([020c2e0](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/020c2e0))
- **window:** 废除 ready-to-show 门禁并对齐窗口主题底色与无边框重绘守护 ([fe263d4](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/fe263d4))
- **renderer:** 注入内联启动壳与双门禁就绪协调器 ([ac1cac3](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/ac1cac3))
- **renderer:** 接入 StartupReadyNotifier 并埋设 React 首帧提交标记 ([527342b](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/527342b))
- **ci:** 接入 OpenCodeReview AI 代码审查 ([121a90d](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/121a90d))
- **shared:** 启动就绪契约常量、类型与 IPC 通道入库 ([ca3512c](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/ca3512c))
- **build:** 新增 startup-shell 构建期内联插件，协调器与 Logo 源码外置、index.html 缩为占位符 ([7f232b8](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/7f232b8))
- **main:** ModuleRunner 链接入主进程就绪闩锁，preload 先拉后推桥接 ([006dcd3](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/006dcd3))
- **build:** 启动壳 Logo 换为 Header 同款蓝底白雷电 ([bff0ed9](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/bff0ed9))
- **renderer:** 移除启动壳深色渐变卡片，Logo 即视觉主体 ([55f405d](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/55f405d))
- **renderer:** 启动壳 Logo 放大至壳容器满幅 96×96 ([f99deed](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/f99deed))
- PR 工作流命令(scripts/pr.ts)与流程文档成文 ([#12](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/12))
- **renderer:** 全局自定义滚动条并按主题声明 color-scheme ([#13](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/13))

### 🩹 缺陷修复 (Bug Fixes)

- **renderer:** 显式传入 linguiConfig 路径以支持从工程根目录启动 dev 开发服务器 ([7a08792](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/7a08792))
- **dialog:** 修复另存为未落盘导致资源管理器定位失效并优化按钮加载态 ([28852a4](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/28852a4))
- **e2e:** 修复 dialog mock 类型不符并补齐 e2e 类型检查覆盖 ([cf4a592](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/cf4a592))
- **dev:** MODE 改由 cross-env 注入并新增 start:dist；lingui 升 6.9 启用原生宏转换 ([9ca92a9](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/9ca92a9))
- **ci:** PR 模板回归单文件形态,修复正文不自动预填 ([edd6b55](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/edd6b55))
- **e2e:** 增强 fixture 退出清理逻辑,增加超时兜底与强杀保护避免 CI teardown 挂起 ([caa01db](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/caa01db))
- **e2e:** 修复 CI 外部进程唤起与 Worker 退出挂起超时问题 ([c3fbed4](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/c3fbed4))
- **startup:** 落实双轴代码审查修正——激活就绪推送腿并加固内联插件 ([bd5a3f6](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/bd5a3f6))
- **scripts:** 门禁只看 required checks,信息性失败不挡合并 ([#14](https://github.com/BanShan-Alec/electron-react-monorepo-template/pull/14))

### 💅 代码重构 (Refactoring)

- **build:** 移除冗余的 maintainer 配置以统一收拢于 package.json ([2b97619](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/2b97619))
- **preload:** 精简双出口与虚拟模块机制，收敛为单一出口 ([9e344be](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/9e344be))
- **shared:** 规范化分层架构与领域切分并沉淀架构规范文档 ([0b98256](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/0b98256))
- 移除 electron-devtools-installer 与冗余依赖 ([d0800e7](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/d0800e7))
- **shared:** 移除桶文件改用子路径导出，17 个消费方直达导入 ([7ec0171](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/7ec0171))
- **renderer:** 移除 16 个桶文件，App 与消费方改为直达具体文件导入 ([74d72f1](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/74d72f1))
- **main:** 移除 modules 与 security 桶、入口零消费者再导出，controllers 与 security 改直达导入 ([7e7c86f](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/7e7c86f))
- **renderer:** 全面迁移 Ant Design v6 并对齐 7 段式组件模板 ([40124a3](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/40124a3))
- **renderer:** 引入 useManualRequest manual-only 封装并迁移全部请求 Hook ([1e0002c](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/1e0002c))
- **renderer:** 统一 IPC 请求层，新增 useIpc 与 callIpc ([a4f01cb](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/a4f01cb))
- **renderer:** Feature 入口化并将 hook 实例化收敛到域内 ([d208108](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/d208108))
- **renderer:** 拆分 diagnostics 与 system-info 为四个平级 feature ([de8a818](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/de8a818))
- **logging:** 规范化日志前缀、消除通道割裂并沉淀工程审查指南 ([6d49b22](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/6d49b22))
- **main:** 将原生 Hash 符号 (#) 私有成员重构为 private 关键字 ([a47d58b](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/a47d58b))
- **main:** 移除 HardwareAccelerationModule 恢复系统默认硬件加速 ([a60aa2a](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/a60aa2a))
- **renderer:** 重构 CodeHighlight 为自包含内聚模块并清理冗余全局类型 ([4ed4e6f](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/4ed4e6f))
- **renderer:** 全部组件统一迁移为一组件一文件夹形态 ([7eac1dd](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/7eac1dd))
- **tsconfig:** 根/e2e/scripts 三处配置收敛到 @app/tsconfig ([c7096c3](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/c7096c3))
- **renderer:** ErrorBoundary 并入 layout 分类，删除 feedback 目录 ([533b2e8](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/533b2e8))
- **ci:** 重构 workflow 体系,救活 CI 门禁并收敛发布管线 ([1a49d24](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/1a49d24))
- **ci:** Setup-env 移除 pnpm store 缓存,步骤回归自然顺序 ([3f9ec9e](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/3f9ec9e))
- **ci:** 移除 Semantic PR 标题校验门禁 ([a520559](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/a520559))
- **build:** 启动壳 Logo 改用 public/favicon.svg 并删除独立 logo.svg ([b8056ec](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/b8056ec))
- **build:** Logo 读取去掉 mtime 缓存，直读+剥除即可 ([81cfa07](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/81cfa07))
- **renderer:** 内联插件迁入 plugins/ 目录并收敛构建工具归属 ([9b81f25](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/9b81f25))
- **build:** 删打包缓存、build 开 minify、Logo 原文直读 ([d38f97d](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/d38f97d))

### 📖 文档更新 (Documentation)

- 落地下沉桶文件禁令与再引入流程，补充执行记录 ([612f4e8](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/612f4e8))
- **shared:** 同步去桶化后的 README——子路径导出替代根入口，移除 index.ts 与 export * 示例 ([0ec9323](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/0ec9323))
- 修正根 README IPC 契约示例与 TODO 失效链接，补桶文件禁令指引 ([9350c53](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/9350c53))
- 补充贡献规范并同步 pnpm 隔离布局表述 ([b69bbc6](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/b69bbc6))
- **renderer:** 重写 README 并沉淀 feature 分层规范 ([bd1cf17](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/bd1cf17))
- 重构根目录 README 为架构全景枢纽并补齐与关联各子包规范 ([c008e84](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/c008e84))
- **i18n:** 新增国际化全链路工程架构设计与开发者实操 SOP 手册 ([dc0fc8c](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/dc0fc8c))
- 完善根目录与渲染进程 README，补充多语言架构索引、SOP 与 E2E 测试指令 ([9165513](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/9165513))
- 简化 README 中关于 i18n 的介绍，收敛并直接指向 docs 文档 ([610a862](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/610a862))
- **spec:** 更新自动更新功能规格说明书为 v2 版本 ([36239c1](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/36239c1))
- **renderer:** 组件组织规则改写为一组件一文件夹并同步桶文件禁令澄清 ([9baf49f](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/9baf49f))
- **specs:** 新增首屏渐进式加载规范与 ADR-0001 窗口材质裁决 ([ed57467](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/ed57467))
- **window:** 新增 WCO 原生标题栏跨项目接入指南 ([00d4ffc](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/00d4ffc))
- **review:** 落实双轴代码审查修正 ([4955900](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/4955900))
- **ci:** 流程指南改名 CICD.md,让出仓库主页 README 显示权 ([2b55c9c](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/2b55c9c))
- **e2e:** 补充主进程全局 shell mock 原因与背景说明 ([395e02a](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/395e02a))
- **specs:** 首屏规范升版 v2——构建期内联与门禁注册表，新增 ADR-0002/0003 与工具链时代规则 ([1d131ea](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/1d131ea))
- **specs:** 新增客户端日志与异常防护整改规范 ([69b66b7](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/69b66b7))

### 🏡 工程维护 (Chores)

- **lint:** 开启 noBarrelFile/noReExportAll/noImportCycles 三条规则为 error 并清理冗余导入 ([45f2ddb](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/45f2ddb))
- 切换 pnpm isolated 布局并更新工程配置与依赖 ([8cf19e3](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/8cf19e3))
- **lint:** 禁止直连 ahooks useRequest 并落地 manual-only 约束文档 ([0c6e578](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/0c6e578))
- **dev:** 重构 dev 脚本与端口机制并统一 configLoader 为 bundle ([85dd836](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/85dd836))
- 清理调试链路死引用与 playwright 依赖 ([a87d9a1](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/a87d9a1))
- **docs:** 移除 docs 目录并修复文档死引用 ([ef6b855](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/ef6b855))
- **updater:** 移除已完结的更新器规范文档 ([af3ff5e](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/af3ff5e))
- **github:** Update LLM API configuration to use secrets ([ced1baf](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/ced1baf))
- **e2e:** Shell 空实现中加入日志记录 ([c1f361d](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/c1f361d))
- 新增 ZCode 工作区忽略配置（同步自 .gitignore） ([fee080f](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/fee080f))

### ✅ 测试相关 (Testing)

- 引入 Playwright E2E 自动化测试套件与初始失败用例 ([27201ca](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/27201ca))
- **e2e:** 增加自动更新模块 6 大场景自动化测试用例 ([1a0c28a](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/1a0c28a))
- **e2e:** 新增 first-screen 用例并回归既有套件 ([9b40a25](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/9b40a25))
- **e2e:** 新增主进程就绪快照断言并全量回归 ([14ef477](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/14ef477))

### 🎨 代码风格 (Styles)

- 清理存量 lint 报错(未用常量与 CSS 缩进) ([66566ca](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/66566ca))

### 🤖 持续集成 (CI/CD)

- 接入自动化跨平台打包工作流并配置 author 为 BanShan-Alec ([1701328](https://github.com/BanShan-Alec/electron-react-monorepo-template/commit/1701328))

### ❤️ Contributors

- 半山Alec <627649674@qq.com>
- Wengzehua <627649674@qq.com>
