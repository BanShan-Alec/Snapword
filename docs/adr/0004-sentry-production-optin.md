# ADR-0004：Sentry 仅在生产构建中按 DSN 显式启用

- 状态：已接受
- 日期：2026-11-05
- 相关：`docs/specs/PRD.md` 第十一章（权限与安全）、第十五章（验收）；`docs/contracts/architecture.md` §12/§16

## 背景

PRD v1.1.1 与 v2.0 的原始隐私条款是「无服务器、无账号、无统计上报」，并要求「除用户配置的 Base URL 外无任何外连」。按该条款，崩溃上报也被一并排除，P4 骨架评审据此移除了 Sentry。

2026-11-05 用户拍板推翻该条款：生产构建需要具备崩溃可观测性，但必须满足以下边界：

1. 开发与测试构建完全不上报，避免本地调试和 CI 产生噪音或误报。
2. 只有构建时显式配置 DSN 才生效；仓库不提交真实 DSN，未配置 DSN 的生产构建等同关闭。
3. 不上报用户内容（原文/译文/Key），不开启行为监控（Breadcrumbs）与性能追踪（Tracing）。
4. 初始化必须位于单实例锁之后，第二实例抢锁失败即退出、不得上报。

## 决策

1. 恢复 `@sentry/electron` 主进程/渲染进程接入，以及 `@sentry/vite-plugin` 的 SourceMap 上传接线。
2. 运行时门控唯一依据为 `app.isPackaged === true` 且 DSN 非空：
   - 主进程 `isSentryEnabled()` 直接使用 `app.isPackaged && Boolean(getSentryDsn())`；
   - 渲染进程通过 preload 注入的 `window.__APP_ENV__.isPackaged` 判定，未打包的 preview 同样不启用；
   - 测试/开发构建不初始化、不上报。
3. DSN 按 temp5 约定存放在**仓库内 `.env`**（已入库）：构建期由 Vite 读取并以 `__SENTRY_DSN__` 静态内联；外部同名环境变量优先，可用于按环境覆盖。`.env.example` 保留空键位说明。`SENTRY_AUTH_TOKEN` 仍只存 CI secret。
4. SourceMap 上传仅在配置 `SENTRY_AUTH_TOKEN` 时生效；无 token 时 `sentryVitePlugin` 自动 disable，构建照常完成。
5. Sentry 初始化调用放在单实例锁模块之后；Sentry 模块只负责窗口崩溃/无响应监听。
6. `telemetry` 保持进程内/IPC trace context，不远程导出、不落盘，与 Sentry 解耦。

## 理由

- **崩溃可观测性与隐私的折中**：只在用户实际使用的打包产物中采集，且必须由发布方显式配置，默认行为仍是零上报。
- **DSN 随仓库走，AUTH_TOKEN 才需要保密**：与 temp5 的部署约定一致；DSN 是客户端标识（会出现在客户端产物里），不是服务端密钥。需要按环境区分时用外部 `SENTRY_DSN` 覆盖即可。
- **门控使用 `app.isPackaged` 而非 `MODE=production`**：`preview` 只是本地生产行为预览，不应产生远程上报；测试构建同理。
- **关闭 Breadcrumbs/Tracing**：崩溃堆栈足以定位问题，行为轨迹与性能数据会扩大隐私面。
- **SourceMap 上传与运行时上报分离**：上传是构建期行为，只依赖 `SENTRY_AUTH_TOKEN`；运行时是否上报只依赖 DSN，两者互不耦合。

## 后果

- PRD 相关条款修订：默认无统计上报，生产构建可选启用 Sentry 崩溃上报；「除 Base URL 外无任何外连」增加 Sentry 上报域名例外（2026-11-05 用户拍板修订）。
- `docs/contracts/architecture.md` §12 增加 Sentry 边界条目，§16 抓包验收增加 Sentry 域名例外。
- 发布流水线只需配置 `SENTRY_AUTH_TOKEN`（SourceMap 上传）；`SENTRY_DSN`/`SENTRY_ORG`/`SENTRY_PROJECT` 在 `.env` 中维护。未配置 DSN 时生产 Sentry 自动关闭，构建不受影响。
- `.env` 按 temp5 约定入库（当前 DSN 为空占位）；`.env.local` 用于本地覆盖且不入库；`.env.example` 保留键位说明。
- 抓包验收需区分「未配置 DSN 的生产构建」与「已配置 DSN 的生产构建」两种形态。
