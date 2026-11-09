/// <reference types="vite/client" />

/**
 * Describes all existing environment variables and their types for Main Process.
 */
interface ImportMetaEnv {
  /**
   * URL where `renderer` web page is running in dev mode.
   */
  readonly VITE_DEV_SERVER_URL: undefined | string;
}

// biome-ignore lint/correctness/noUnusedVariables: Vite ImportMeta augmentation
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * 主进程业务与运行时所使用的环境配置键名
 */
export type EnvKey = 'API_BASE_URL' | 'SYSTEM_CODE' | 'DISTRIBUTION_CHANNEL' | 'SENTRY_DSN';

declare global {
  const __APP_VERSION__: string;
  const __SENTRY_DSN__: string;
  const __RELEASE_NAME__: string;
  /** 编译期从根 package.json 的 repository.url 解析出的 GitHub 发布源 owner */
  const __GITHUB_OWNER__: string;
  /** 编译期从根 package.json 的 repository.url 解析出的 GitHub 发布源 repo */
  const __GITHUB_REPO__: string;
  /** 外部动态环境变量的前缀标识符 (来自 .env 中的 ENV_PREFIX，如 APP_) */
  const __ENV_PREFIX__: string;
  /** 编译期静态内联的 .env 全局配置快照字典 (用于无外部环境变量时的静态兜底) */
  const __ENV_DEFAULTS__: Record<EnvKey, string>;
}
