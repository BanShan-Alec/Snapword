// @sentry/electron/preload 通过 vite.config.ts 的 ssr.noExternal: true 完全内联打包进 dist/index.cjs，
// 运行时零外部依赖，故作为 devDependencies 安装与管理
import '@sentry/electron/preload';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import type { CloseBehaviorChoice } from '@app/shared/schemas/close-behavior';
import type { AppConfig, UpdateConfigInput } from '@app/shared/schemas/config';
import type { LogInput, PerformActionInput } from '@app/shared/schemas/diagnostics';
import type { ShowItemInFolderInput } from '@app/shared/schemas/shell';
import type { AbortTranslationInput, TranslationInput } from '@app/shared/schemas/translate';
import type { ElectronApi } from '@app/shared/types/api';
import type { AppRuntimeEnv } from '@app/shared/types/env';
import type {
  TranslationChunkEvent,
  TranslationErrorEvent,
  TranslationFinishEvent,
} from '@app/shared/types/translate';
import type { UpdaterProgress, UpdaterSnapshot } from '@app/shared/types/updater';
import { APP_ENV_ARG_PREFIX, unpackRuntimeEnv } from '@app/shared/utils/env-packer';
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { loggerBridge } from './logger';
import { invokeTraced } from './telemetry/ipc-tracer';

// 运行时环境基座同步挂载：在页面执行任何脚本前从 argv 快速解包并深度冻结暴露
const metaArg = process.argv.find((arg) => arg.startsWith(APP_ENV_ARG_PREFIX));
let runtimeEnv: AppRuntimeEnv | null = null;
if (metaArg) {
  try {
    runtimeEnv = unpackRuntimeEnv(metaArg.slice(APP_ENV_ARG_PREFIX.length));
  } catch (err) {
    console.error('[preload] Failed to unpack runtime env from additionalArguments:', err);
  }
}
contextBridge.exposeInMainWorld('__APP_ENV__', Object.freeze(runtimeEnv ?? {}));

export const apiBridge: ElectronApi = {
  system: {
    ping: (_payload, options) => invokeTraced(IPC_CHANNELS.SYSTEM_PING, undefined, options),
    getSystemInfo: (_payload, options) =>
      invokeTraced(IPC_CHANNELS.SYSTEM_GET_INFO, undefined, options),
    getPlatform: () => process.platform,
  },
  window: {
    onCloseRequested: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on(IPC_CHANNELS.WINDOW_CLOSE_REQUESTED, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_CLOSE_REQUESTED, listener);
      };
    },
    closeReady: (_payload, options) =>
      invokeTraced(IPC_CHANNELS.WINDOW_CLOSE_READY, undefined, options),
    closeRespond: (choice: CloseBehaviorChoice, options) =>
      invokeTraced(IPC_CHANNELS.WINDOW_CLOSE_RESPOND, choice, options),
  },
  config: {
    get: (_payload, options) => invokeTraced(IPC_CHANNELS.CONFIG_GET, undefined, options),
    update: (input: UpdateConfigInput, options) =>
      invokeTraced(IPC_CHANNELS.CONFIG_UPDATE, input, options),
    reset: (_payload, options) => invokeTraced(IPC_CHANNELS.CONFIG_RESET, undefined, options),
    onChanged: (cb: (config: AppConfig) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, config: AppConfig) => cb(config);
      ipcRenderer.on(IPC_CHANNELS.CONFIG_EVENT_CHANGED, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.CONFIG_EVENT_CHANGED, listener);
      };
    },
  },
  diagnostics: {
    log: (input: LogInput, options) => invokeTraced(IPC_CHANNELS.DIAGNOSTICS_LOG, input, options),
    openLogFolder: (_payload, options) =>
      invokeTraced(IPC_CHANNELS.DIAGNOSTICS_OPEN_LOG_FOLDER, undefined, options),
    performAction: (input: PerformActionInput, options) =>
      invokeTraced(IPC_CHANNELS.DIAGNOSTICS_PERFORM_ACTION, input, options),
  },
  shell: {
    showItemInFolder: (input: ShowItemInFolderInput, options) =>
      invokeTraced(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, input, options),
    openExternal: (url: string, options) =>
      invokeTraced(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, url, options),
  },
  updater: {
    getState: (_payload, options) =>
      invokeTraced(IPC_CHANNELS.UPDATER_GET_STATE, undefined, options),
    check: (_payload, options) => invokeTraced(IPC_CHANNELS.UPDATER_CHECK, undefined, options),
    download: (_payload, options) =>
      invokeTraced(IPC_CHANNELS.UPDATER_DOWNLOAD, undefined, options),
    cancel: (_payload, options) => invokeTraced(IPC_CHANNELS.UPDATER_CANCEL, undefined, options),
    install: (_payload, options) => invokeTraced(IPC_CHANNELS.UPDATER_INSTALL, undefined, options),
    openWindow: (_payload, options) =>
      invokeTraced(IPC_CHANNELS.UPDATER_OPEN_WINDOW, undefined, options),
    closeWindow: (_payload, options) =>
      invokeTraced(IPC_CHANNELS.UPDATER_CLOSE_WINDOW, undefined, options),
    onStateChanged: (cb: (s: UpdaterSnapshot) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, s: UpdaterSnapshot) => cb(s);
      ipcRenderer.on(IPC_CHANNELS.UPDATER_EVENT_STATE, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_EVENT_STATE, listener);
      };
    },
    onProgressChanged: (cb: (p: UpdaterProgress) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, p: UpdaterProgress) => cb(p);
      ipcRenderer.on(IPC_CHANNELS.UPDATER_EVENT_PROGRESS, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_EVENT_PROGRESS, listener);
      };
    },
  },
  translation: {
    translate: (input: TranslationInput, options) =>
      invokeTraced(IPC_CHANNELS.TRANSLATION_TRANSLATE, input, options),
    abort: (input: AbortTranslationInput, options) =>
      invokeTraced(IPC_CHANNELS.TRANSLATION_ABORT, input, options),
    onChunk: (cb: (event: TranslationChunkEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: TranslationChunkEvent) => cb(data);
      ipcRenderer.on(IPC_CHANNELS.TRANSLATION_EVENT_CHUNK, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.TRANSLATION_EVENT_CHUNK, listener);
      };
    },
    onFinish: (cb: (event: TranslationFinishEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: TranslationFinishEvent) =>
        cb(data);
      ipcRenderer.on(IPC_CHANNELS.TRANSLATION_EVENT_FINISH, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.TRANSLATION_EVENT_FINISH, listener);
      };
    },
    onError: (cb: (event: TranslationErrorEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: TranslationErrorEvent) => cb(data);
      ipcRenderer.on(IPC_CHANNELS.TRANSLATION_EVENT_ERROR, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.TRANSLATION_EVENT_ERROR, listener);
      };
    },
  },
  // 遵循 specs-electron-fullstack / renderer/ipc-consumption.md 安全规范
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  invokeTraced,
};

contextBridge.exposeInMainWorld('api', apiBridge);
contextBridge.exposeInMainWorld('logger', loggerBridge);
