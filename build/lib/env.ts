import { loadEnv } from 'vite';
import { findRepoRoot } from './repo-paths';

/**
 * 构建期环境变量统一加载器
 *
 * 全仓构建脚本 / Vite 配置 / Sentry 配置只允许经此加载根 .env，避免：
 * - 多处 loadEnv 各自推导根目录与 mode 默认值（构建默认 production、dev 默认 development）
 * - `Object.assign(process.env, loadEnv(...))` 把 .env 的 MODE 反向覆盖 cross-env 注入值
 *
 * 优先级：外部注入（shell / CI / cross-env） > 根 .env > 调用方默认值。
 */
export interface RepoEnv {
  rootDir: string;
  mode: string;
  /** 根 .env 在指定 mode 下的键值（loadEnv 结果，空前缀表示不做前缀过滤） */
  values: Record<string, string>;
}

export function loadRepoEnv(fromDir: string, defaultMode = 'production'): RepoEnv {
  const rootDir = findRepoRoot(fromDir);
  const mode = process.env.MODE || defaultMode;
  const values = loadEnv(mode, rootDir, '');
  return { rootDir, mode, values };
}

/**
 * 将 .env 值补进 process.env，但不覆盖已存在的外部注入。
 * 这是与旧 `Object.assign` 的关键差异：cross-env MODE 与 CI Secrets 始终优先。
 */
export function applyRepoEnv(env: RepoEnv): void {
  for (const [key, value] of Object.entries(env.values)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/** 读取单个键，外部注入优先于 .env */
export function getRepoEnvValue(env: RepoEnv, key: string): string {
  return process.env[key] ?? env.values[key] ?? '';
}
