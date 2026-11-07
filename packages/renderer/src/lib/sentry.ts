import * as Sentry from '@sentry/electron/renderer';

/**
 * 生产级 Sentry 渲染进程配置
 * 1. 严格仅在「生产打包环境（app.isPackaged=true）」且有效 DSN 时激活上报；
 *    开发 / 测试 / 未打包 preview 一律零网络开销与侵入
 * 2. 仅开启致命异常监控（window.onerror / unhandledrejection / React 组件崩溃）
 * 3. 彻底禁用行为监控（Breadcrumbs / DOM / Console / Net 轨迹），保护隐私与性能
 * 4. 彻底禁用性能追踪（Tracing / Profiling），采样率为 0
 */
export function initSentry(): void {
  const dsn = (typeof window !== 'undefined' && window.__APP_ENV__?.sentryDsn) || '';

  // 生产打包是唯一门控：isPackaged 由主进程注入，preview（MODE=production 但未打包）也不启用
  const isPackaged = typeof window !== 'undefined' && window.__APP_ENV__?.isPackaged === true;

  // 严格守卫：仅生产打包且有效 DSN 时激活
  const isEnabled = isPackaged && Boolean(dsn);

  if (!isEnabled) {
    return;
  }

  const appVersion = (typeof window !== 'undefined' && window.__APP_ENV__?.appVersion) || 'unknown';
  const release =
    (typeof window !== 'undefined' && window.__APP_ENV__?.releaseName) ||
    `${(typeof window !== 'undefined' && window.__APP_ENV__?.appName) || 'electron-app'}@${appVersion}`;

  Sentry.init({
    dsn,
    enabled: true,
    environment: 'production',
    release,

    // 彻底关闭行为监控（Breadcrumbs）
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    integrations: (defaults) => defaults.filter((i) => !i.name.includes('Breadcrumb')),

    // 彻底关闭性能监控（Tracing）
    tracesSampleRate: 0,

    // 过滤常见前端非致命噪声
    ignoreErrors: [
      'ResizeObserver loop completed with undelivered notifications',
      'ResizeObserver loop limit exceeded',
      'Network Error',
      'Failed to fetch',
      'Load failed',
    ],
  });
}

export { Sentry };
