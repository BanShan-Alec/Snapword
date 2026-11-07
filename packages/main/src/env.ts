import { APP_ENV, type AppEnv } from '@app/shared/constants/env';
import type { AppRuntimeEnv } from '@app/shared/types/env';
import { app } from 'electron';

/**
 * 是否处于自动化测试环境 (Playwright / Vitest)
 * 由测试启动器注入 MODE=test 或 Vitest/NODE_ENV 运行环境
 */
export const isTest: boolean =
  process.env.MODE === 'test' || process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

/**
 * 是否处于已打包二进制分发形态 (.exe / .app / AppImage)
 * Electron 官方权威判定，打包后二进制恒为 true
 */
export const isPackaged: boolean = Boolean(app?.isPackaged);

/**
 * 是否处于本地开发态
 * 判定原则：未打包 + 非测试模式 + MODE 未显式指定为 production
 */
export const isDev: boolean = !isPackaged && !isTest && process.env.MODE !== 'production';

/**
 * 是否处于生产行为态
 * 判定原则：非测试模式，且已打包或 MODE 显式为 production（例如 preview 预览）
 */
export const isProd: boolean = !isTest && (isPackaged || process.env.MODE === 'production');

/**
 * 获取当前权威运行环境语义 ('development' | 'production' | 'test')
 */
export function getAppEnv(): AppEnv {
  if (isTest) {
    return APP_ENV.TEST;
  }
  if (isDev) {
    return APP_ENV.DEVELOPMENT;
  }
  return APP_ENV.PRODUCTION;
}

export const currentAppEnv: AppEnv = getAppEnv();

/**
 * 本地开发服务器 URL (若存在且严格处于开发态)
 */
export const devServerUrl: string | undefined =
  process.env.MODE === 'development' && process.env.VITE_DEV_SERVER_URL
    ? process.env.VITE_DEV_SERVER_URL
    : undefined;

import type { EnvKey } from './env.d';

/**
 * 读取动态环境配置：
 * 优先级 1：外部动态注入的带前缀环境变量 process.env[`${__ENV_PREFIX__}${key}`] (如 APP_API_BASE_URL)
 * 优先级 2：调用处传入的显式 fallback (若提供)
 * 优先级 3：编译期 Vite define 注入的静态默认值快照 __ENV_DEFAULTS__[key]
 */
export function getEnv(key: EnvKey, fallback?: string): string {
  const prefix = typeof __ENV_PREFIX__ !== 'undefined' ? __ENV_PREFIX__ : 'APP_';
  const prefixedKey = `${prefix}${key}`;
  const envVal = process.env[prefixedKey];
  if (envVal !== undefined && envVal !== '') {
    return envVal;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  if (typeof __ENV_DEFAULTS__ !== 'undefined' && __ENV_DEFAULTS__[key] !== undefined) {
    return __ENV_DEFAULTS__[key];
  }
  return '';
}

/**
 * 编译期从根 package.json 的 repository.url 解析出的 GitHub 发布源坐标
 *
 * 未打包形态（preview）下 electron-updater 需要显式 setFeedURL；
 * 该坐标属于仓库身份，随代码走，不再支持 .env 覆盖。
 */
export const bundledRepository = {
  owner: typeof __GITHUB_OWNER__ !== 'undefined' ? __GITHUB_OWNER__ : '',
  repo: typeof __GITHUB_REPO__ !== 'undefined' ? __GITHUB_REPO__ : '',
} as const;

/**
 * 获取注入给渲染进程的全局只读运行时环境基座快照
 */
export function getRuntimeEnvSnapshot(): AppRuntimeEnv {
  if (!app.isReady()) {
    throw new Error('Cannot get runtime env snapshot before app is ready.');
  }

  return {
    mode: currentAppEnv,
    appVersion: app.getVersion(),
    appName: app.getName(),
    channel: getEnv('DISTRIBUTION_CHANNEL') || undefined,
    apiBaseUrl: getEnv('API_BASE_URL') || undefined,
    systemCode: getEnv('SYSTEM_CODE') || undefined,
    sentryDsn:
      getEnv('SENTRY_DSN') ||
      (typeof __SENTRY_DSN__ !== 'undefined' && __SENTRY_DSN__ ? __SENTRY_DSN__ : undefined),
    releaseName: typeof __RELEASE_NAME__ !== 'undefined' ? __RELEASE_NAME__ : undefined,
  };
}

import { APP_ENV_ARG_PREFIX, packRuntimeEnv } from '@app/shared/utils/env-packer';

/**
 * 将运行时环境快照序列化为命令行启动参数（压缩混淆形式）
 */
export function getPackedEnvArgument(env: AppRuntimeEnv = getRuntimeEnvSnapshot()): string {
  return `${APP_ENV_ARG_PREFIX}${packRuntimeEnv(env)}`;
}
