import { APP_ENV, type AppEnv } from '@app/shared/constants/env';
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
