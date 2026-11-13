import { APP_ENV } from '@app/shared/constants/env';
import { APP_ENV_ARG_PREFIX, unpackRuntimeEnv } from '@app/shared/utils/env-packer';

/**
 * 从 additionalArguments 解包运行环境并判定是否开发构建。
 * 供 logger 桥等非 index 入口模块复用；解包失败按非开发处理（与渲染层 ipc.ts 的宽松判定一致）。
 */
export function resolveIsDev(): boolean {
  const metaArg = process.argv.find((arg) => arg.startsWith(APP_ENV_ARG_PREFIX));
  if (!metaArg) return false;
  try {
    return unpackRuntimeEnv(metaArg.slice(APP_ENV_ARG_PREFIX.length)).mode === APP_ENV.DEVELOPMENT;
  } catch {
    return false;
  }
}
