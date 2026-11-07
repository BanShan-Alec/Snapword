---

title: 崩溃上报（Sentry）
description: 严格收窄激活条件，渲染进程崩溃由主进程兜底代报，关闭噪音埋点。
---

# 崩溃上报（Sentry）

> **TL;DR**：仅在物理打包态且配置有效 DSN 时激活 Sentry，开发模式零网络开销与噪音；彻底关闭面包屑轨迹与性能采样以减轻性能负担；渲染进程异常退出由主进程监听兜底上报。

## 1. 选型理由

桌面客户端运行在不可控的用户终端环境中，崩溃往往静默发生：
1. **渲染进程崩溃无法自报**：若 Chromium 渲染进程发生 OOM（内存溢出）或 Native 段错误闪退，页面 JS 引擎随之灰飞烟灭，前端 Sentry 根本没有执行上报的机会。
2. **海量网络噪音与卡顿**：传统 Web 默认收集 DOM 交互轨迹（Breadcrumbs）、Console 日志与性能采样，在桌面端不仅消耗用户带宽与 CPU，还极易录入敏感隐私。

工程采取主进程代报兜底策略，并将 Sentry 定位为“极简致命崩溃捕获器”。

## 2. 核心机制

### 严格的激活守卫与范围收窄

→ 源码：[packages/main/src/modules/sentry.module.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/modules/sentry.module.ts)

```ts
export function isSentryEnabled(): boolean {
  return app.isPackaged && Boolean(getSentryDsn());
}

// 采集范围最小化：彻底关闭行为轨迹与性能剖析，仅上报未捕获崩溃
Sentry.init({
  dsn: getSentryDsn(),
  maxBreadcrumbs: 0,
  beforeBreadcrumb: () => null,
  tracesSampleRate: 0,
});
```

### 主进程代报渲染进程崩溃（render-process-gone）

监听 Electron 原生应用级事件，在渲染进程阵亡时由主进程收集退出原因并上报：

```ts
app.on('render-process-gone', (_event, _webContents, details) => {
  // 正常退出（clean-exit）或主动关机时不报
  if (appLifecycle.isQuitting || details.reason === 'clean-exit') return;

  Sentry.captureException(
    new Error(
      `[Renderer Crash] process gone: reason=${details.reason}, exitCode=${details.exitCode}`,
    ),
    {
      level: 'fatal',
      tags: {
        process: 'renderer',
        crash_reason: details.reason,
        exit_code: details.exitCode,
      },
    },
  );
});
```

针对页面假死挂起，通过监听 `browser-window-created` 挂载 `unresponsive` 事件进行警报。

## 3. 桌面端避坑注意事项

- **开发态与未配 DSN 时全链路静默**：
  - 本地运行 `pnpm dev` 或未配置 `SENTRY_DSN` 时，Sentry 初始化静默跳过，控制台不报任何警报。排查“为何没收到报错”前先核实运行形态。
- **SourceMap 绝不打包进最终 ASAR**：
  - 构建产物使用 `hidden-source-map` 模式生成映射。CI 流水线调用 `@sentry/cli` 上传 SourceMap 后立即物理删除 `.map` 文件，配合打包规则杜绝源码逆向风险。
- **前端忽略无害噪声（ignoreErrors）**：
  - 渲染端需显式过滤 `ResizeObserver loop completed with undelivered notifications` 等浏览器引擎内部微量良性警告，避免占用企业 Sentry 事件配额。
