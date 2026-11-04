/**
 * 应用运行语义环境常量 (App Runtime Environment Constants)
 * 统一跨端 (Main / Preload / Renderer / Shared) 运行环境的事实标准
 */
export const APP_ENV = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test',
} as const;

export type AppEnv = (typeof APP_ENV)[keyof typeof APP_ENV];
