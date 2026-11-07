---

title: 配置项归属（Configuration-map）
description: 一个值该改哪、何时生效、有什么副作用——身份、环境、端口、常量与偏好速查表。
---

# 配置项归属（Configuration-map）

> **TL;DR**：一个配置只有一个所有者（Single Owner）——应用身份在根 `package.json`、构建脚本在 `build/`、环境差异在 `.env`、开发编排在 `scripts/dev.ts`、业务常量在 `shared`、用户偏好在 `ConfigStore`。

## 1. 六层配置归属法则

| 配置层级                | 存储载体               | 包含范围                                     | 生效机制与时机                  |
| :---------------------- | :--------------------- | :------------------------------------------- | :------------------------------ |
| **应用身份 / OTA 坐标** | 根 `package.json`      | `name`、`productName`、`appId`、`repository` | 构建期与物理打包期注入          |
| **构建基础设施**        | `build/*.ts`           | 打包平台、资源拷贝、签名证书、Sentry 上传    | `pnpm build:*` 打包期执行       |
| **环境差异变量**        | 根 `.env` / Shell      | `API_BASE_URL`、发布通道、日志级别、DSN      | 构建期内联快照 + 运行时参数覆盖 |
| **开发态编排**          | `scripts/dev.ts`       | Vite 端口、CDP 远程调试、主进程断点端口      | `pnpm dev` / `preview` 启动时   |
| **跨端契约常量**        | `packages/shared`      | 默认窗口几何宽高、IPC 通道名、安全白名单     | 源码编译进产物（需重启构建）    |
| **用户偏好设置**        | `userData/config.json` | 主题深浅模式、多语言 Locale、开机自启        | 运行时读写（通过 IPC 瞬时生效） |

## 2. 常见改动速查表（Cheat-Sheet）

| 想改什么               | 修改文件与字段                                   | 生效命令 / 时机   | 潜在影响与避坑要点                                                                |
| :--------------------- | :----------------------------------------------- | :---------------- | :-------------------------------------------------------------------------------- |
| **应用展示名**         | 根 `package.json` ➔ `productName`                | 重新构建打包      | **高危**：会改变操作系统 `userData` 目录路径，旧用户数据与日志不会自动迁移        |
| **应用包名 / 资产名**  | 根 `package.json` ➔ `name`                       | 重新构建打包      | 必须为小写字母及中划线，`verify:prebuild` 静态门禁强制拦截                        |
| **系统应用 ID**        | 根 `package.json` ➔ `appId`                      | 重新打包          | 影响 Windows 桌面通知 AUMID 与 macOS 应用唯一标识，发布后切勿随意变更             |
| **前端品牌主色**       | `packages/renderer/src/styles/design-tokens.ts`  | Vite 实时热更     | Ant Design 主题算法与 CSS 变量作用域会自动联动派生浅/深色板                       |
| **API 请求基础地址**   | 根 `.env` ➔ `API_BASE_URL`                       | 重新启动开发/构建 | 生产环境可在运行期通过 `APP_API_BASE_URL` 系统环境变量免打包动态覆盖              |
| **开发态渲染端口**     | `scripts/dev.ts` ➔ `config.rendererPort`         | 重启 `pnpm dev`   | 端口被占时启动预检会交互式提示释放，并自动通知主进程连接真实端口                  |
| **主进程源码级断点**   | `scripts/dev.ts` ➔ `config.mainInspectPort`      | 取消注释并重启    | 启动时会传入 `--inspect-brk=9229`，终端阻塞等待 VS Code 等 IDE 附加               |
| **渲染层 CDP 端口**    | `scripts/dev.ts` ➔ `config.rendererCdpPort`      | 注释即关闭并重启  | 注释后将关闭 9222 端口并移除启动日志，启动预检不再扫描该端口                      |
| **打包体积限制阈值**   | 根 `.env` ➔ `MAX_ASAR_SIZE_MB`                   | 下次运行打包      | CI 门禁检查打包产物体积是否超标，超过阈值立即阻断发版流水线                       |
| **Sentry 异常上报源**  | 根 `.env` ➔ `SENTRY_DSN`                         | 打包构建时生效    | CI 流程需在 GitHub Secrets 配置 `SENTRY_AUTH_TOKEN` 以支持 SourceMap 上传         |
| **外链打开域名白名单** | `packages/shared/src/constants/security.ts`      | 重新构建主进程    | 拦截非白名单链接通过系统默认浏览器唤起，防止桌面端钓鱼攻击                        |
| **应用安装包图标**     | `build/resources/icon.{ico,icns,png}`            | 重新打包生效      | Windows 必须包含 256x256 多分辨率 ico，macOS 必须为 1024x1024 包含 Retina 的 icns |
| **默认窗口几何尺寸**   | `packages/shared/src/constants/window.ts`        | 重新构建生效      | 首次启动生效；已有运行记录时优先从 `userData/window-state.json` 恢复记忆几何      |
| **系统托盘图标与行为** | `packages/main/src/modules/tray/index.module.ts` | 重启主进程生效    | macOS 托盘需遵循黑白高对比度 Template 图标规范，Windows 需考虑高 DPI 缩放         |

## 3. 桌面端避坑注意事项

- **`MODE` 与 `app.isPackaged` 的物理差异**：
  - `MODE=production` 控制的是逻辑行为（加载静态 HTML、开启生产 CSP）；`app.isPackaged` 控制的是物理打包态（ASAR 打包、自动更新真实拉取）。`pnpm preview` 是「未打包但运行生产行为」，切勿把两者混用。
- **运行时修改配置走 `ConfigStore`**：
  - 用户的暗黑主题、语言偏好等数据属于用户运行时数据，严禁通过修改代码文件或 `.env` 实现，必须经由 `@app/shared` 的 Zod 契约持久化在 `userData/config.json` 中。
- **修改 `@app/shared` 常量跨包生效**：
  - 路径别名（paths）已全部映射至源码 `src/*`，但在修改 shared 常量后，若在纯 `pnpm preview` 状态，请确保重新构建受影响的 Main 与 Renderer 包。
