/// <reference types="vite/client" />

import type { ElectronApi } from '@shared/types/api';
import type { LoggerApi } from '@shared/types/logger';

declare global {
  /** 平行于 console 的全局日志桥（window.logger），fire-and-forget 落盘 renderer-<window>.log */
  const logger: LoggerApi;

  interface Window {
    readonly api: ElectronApi;
    readonly logger: LoggerApi;
  }
}

declare module '*.po' {
  import type { Messages } from '@lingui/core';
  export const messages: Messages;
}
