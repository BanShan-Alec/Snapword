/// <reference types="vite/client" />

import type { AppRuntimeEnv } from '@app/shared/types/env';
import type { ElectronApi } from '@shared/types/api';
import type { LoggerApi } from '@shared/types/logger';

declare global {
  /** Preload 通过 additionalArguments 同步解包注入的全局只读运行时环境基座 */
  const __APP_ENV__: AppRuntimeEnv;

  /** 平行于 console 的全局日志桥（window.logger），fire-and-forget 落盘 renderer-<window>.log */
  const logger: LoggerApi;

  interface Window {
    readonly api: ElectronApi;
    readonly logger: LoggerApi;
    readonly __APP_ENV__: AppRuntimeEnv;
  }
}

declare module '*.po' {
  import type { Messages } from '@lingui/core';
  export const messages: Messages;
}
