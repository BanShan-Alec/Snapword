import type { AppEnv } from '../constants/env';

export type { AppEnv };

export interface EnvFlags {
  readonly isDev: boolean;
  readonly isProd: boolean;
  readonly isTest: boolean;
  readonly isPackaged: boolean;
  readonly env: AppEnv;
}

/**
 * 注入到渲染进程的全局只读运行时环境基座
 */
export interface AppRuntimeEnv {
  /** 应用运行语义模式 ('development' | 'production' | 'test')，对齐 APP_ENV 枚举 */
  readonly mode: AppEnv;
  /** 应用语义版本号 */
  readonly appVersion: string;
  /** 应用显示名称 */
  readonly appName: string;
  /** 发布与分发渠道 (如 'stable' | 'beta') */
  readonly channel?: string;
  /** 基础 API 网关 URL */
  readonly apiBaseUrl?: string;
  /** 系统编号 / 业务标识 */
  readonly systemCode?: string;
  /** 生产监控 Sentry DSN (若已配置) */
  readonly sentryDsn?: string;
  /** 生产监控 Sentry Release 标识名称 */
  readonly releaseName?: string;
}
