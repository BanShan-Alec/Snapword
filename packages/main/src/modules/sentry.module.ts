/// <reference path="../env.d.ts" />

import { APP_FEATURES, buildSentryTags, SENTRY_TAGS } from '@app/shared/constants/telemetry';
import * as Sentry from '@sentry/electron/main';
import { app, type BrowserWindow } from 'electron';
import type { AppModule } from '../AppModule';
import { getEnv } from '../env';
import { appLifecycle } from '../lifecycle';
import type { ModuleContext } from '../ModuleContext';
import { getLogManager } from './log.module';

const SENTRY_LOGGER_SCOPE = 'SentryModule';
const logger = getLogManager().scoped(SENTRY_LOGGER_SCOPE);

/**
 * 获取用于 Sentry 初始化的 DSN
 * 优先取构建期 define 注入的常量，其次走统一环境门面（APP_SENTRY_DSN > .env 默认值）
 */
export function getSentryDsn(): string {
  if (typeof __SENTRY_DSN__ !== 'undefined' && __SENTRY_DSN__) {
    return __SENTRY_DSN__;
  }
  return getEnv('SENTRY_DSN');
}

/**
 * 判断当前是否满足 Sentry 采集条件：
 * 严格限制仅打包后（app.isPackaged）且配置有效 DSN 时才激活
 */
export function isSentryEnabled(): boolean {
  return app.isPackaged && Boolean(getSentryDsn());
}

/**
 * 主进程 Sentry 全局初始化
 * 必须在主进程生命周期最早期同步执行，内部包裹完整容错防止初始化失败导致主进程崩溃
 */
export function initMainSentry(): void {
  try {
    const dsn = getSentryDsn();
    const enabled = isSentryEnabled();

    if (!enabled || !dsn) {
      logger.info('Initialization skipped: not packaged or missing DSN');
      return;
    }

    const appVersion =
      typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__
        ? __APP_VERSION__
        : app.getVersion();
    const release =
      typeof __RELEASE_NAME__ !== 'undefined' && __RELEASE_NAME__
        ? __RELEASE_NAME__
        : `${app.getName()}@${appVersion}`;

    Sentry.init({
      dsn,
      enabled: true,
      environment: app.isPackaged ? 'production' : process.env.MODE || 'development',
      release,

      // 彻底关闭行为监控（Breadcrumbs / DOM / Console / Net 轨迹）
      maxBreadcrumbs: 0,
      beforeBreadcrumb: () => null,
      integrations: (defaults) => defaults.filter((i) => !i.name.includes('Breadcrumb')),

      // 彻底关闭性能监控（Tracing / Profiling）
      tracesSampleRate: 0,
    });

    logger.info('Initialized successfully in main process');
  } catch (error) {
    // 捕获所有初始化异常，绝不允许因监控初始化失败阻断整个 Electron 应用启动
    logger.error('Failed to initialize in main process:', error);
  }
}

/**
 * Sentry 模块：托管窗口崩溃与未响应监听
 */
export class SentryModule implements AppModule {
  enable({ app }: ModuleContext): void {
    if (!isSentryEnabled()) {
      return;
    }

    // 1. 全局监听渲染进程崩溃 (render-process-gone)
    app.on('render-process-gone', (_event, webContents, details) => {
      logger.error('Renderer process gone unexpectedly:', details);

      if (appLifecycle.isQuitting || details.reason === 'clean-exit') {
        return;
      }

      let currentUrl = 'unknown';
      try {
        currentUrl = webContents.getURL();
      } catch {
        // webContents 可能已销毁
      }

      Sentry.captureException(
        new Error(
          `[Renderer Crash] process gone: reason=${details.reason}, exitCode=${details.exitCode}`,
        ),
        {
          level: 'fatal',
          tags: buildSentryTags(APP_FEATURES.WINDOW, {
            [SENTRY_TAGS.LOGGER]: SENTRY_LOGGER_SCOPE,
            [SENTRY_TAGS.PROCESS]: 'renderer',
            [SENTRY_TAGS.CRASH_REASON]: details.reason,
            [SENTRY_TAGS.EXIT_CODE]: details.exitCode,
          }),
          extra: {
            details,
            url: currentUrl,
          },
        },
      );
    });

    // 2. 全局监听窗口无响应与恢复 (unresponsive / responsive)
    app.on('browser-window-created', (_event, window: BrowserWindow) => {
      window.on('unresponsive', () => {
        let currentUrl = 'unknown';
        try {
          currentUrl = window.webContents.getURL();
        } catch (err) {
          logger.warn(`Failed to get URL for unresponsive window (id=${window.id}):`, err);
        }

        logger.error(`Window (id=${window.id}) is unresponsive`);
        Sentry.captureMessage(`[Window Unresponsive] Window (id=${window.id}) is unresponsive`, {
          level: 'error',
          tags: buildSentryTags(APP_FEATURES.WINDOW, {
            [SENTRY_TAGS.LOGGER]: SENTRY_LOGGER_SCOPE,
            [SENTRY_TAGS.PROCESS]: 'window',
            [SENTRY_TAGS.WINDOW_ID]: window.id,
          }),
          extra: {
            url: currentUrl,
          },
        });
      });

      window.on('responsive', () => {
        logger.info(`Window (id=${window.id}) is responsive again`);
      });
    });
  }
}

export function createSentryModule(): SentryModule {
  return new SentryModule();
}
