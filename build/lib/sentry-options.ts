import { APP_IDENTITY } from './app-identity';
import { getRepoEnvValue, loadRepoEnv } from './env';

export interface SentryBuildOptions {
  rootDir: string;
  appName: string;
  appVersion: string;
  releaseName: string;
  sentryDsn: string;
  sentryOrg: string;
  sentryProject: string;
  sentryAuthToken: string;
}

/**
 * 统一解析根目录 package.json 身份与 .env 中的 Sentry 构建期配置
 *
 * 构建期基础设施模块：环境由 build/lib/env.ts 单点加载，身份由 build/lib/app-identity.ts 单点解析。
 */
export function getSentryBuildOptions(fromDir: string): SentryBuildOptions {
  const env = loadRepoEnv(fromDir, 'production');
  const value = (key: string): string => getRepoEnvValue(env, key);

  return {
    rootDir: env.rootDir,
    appName: APP_IDENTITY.name,
    appVersion: APP_IDENTITY.version,
    releaseName: `${APP_IDENTITY.name}@${APP_IDENTITY.version}`,
    sentryDsn: value('SENTRY_DSN'),
    sentryOrg: value('SENTRY_ORG'),
    sentryProject: value('SENTRY_PROJECT'),
    sentryAuthToken: value('SENTRY_AUTH_TOKEN'),
  };
}
