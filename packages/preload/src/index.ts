// @sentry/electron/preload 通过 vite.config.ts 的 ssr.noExternal: true 完全内联打包进 dist/index.cjs，
// 运行时零外部依赖，故作为 devDependencies 安装与管理
import '@sentry/electron/preload';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { APP_STARTUP_MAIN_READY_EVENT } from '@app/shared/constants/startup';
import type { CalculateInput } from '@app/shared/schemas/calculator';
import type { CloseBehaviorChoice } from '@app/shared/schemas/close-behavior';
import type { AppConfig, UpdateConfigInput } from '@app/shared/schemas/config';
import type { StepInput } from '@app/shared/schemas/counter';
import type { LogInput, PerformActionInput } from '@app/shared/schemas/diagnostics';
import type { OpenDirectoryInput, OpenFileInput, SaveFileInput } from '@app/shared/schemas/dialog';
import type { ShowItemInFolderInput } from '@app/shared/schemas/shell';
import type { ElectronApi } from '@app/shared/types/api';
import type { AppRuntimeEnv } from '@app/shared/types/env';
import type { StartupGateSnapshot, StartupMainReadyPayload } from '@app/shared/types/startup';
import type { IpcCallOptions } from '@app/shared/types/telemetry';
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

// 启动就绪桥：先拉后推，主进程信号先于窗口时经快照补发不丢。
// 求值时即预取快照并注册推送监听（不等 onMainReady 被调用）——晚到信号经跨世界
// 纯 Event 派发给壳协调器（contextIsolation 下无 payload Event 可见），payload 经回调携带
const mainReadyCallbacks = new Set<(payload: StartupMainReadyPayload) => void>();
const startupSnapshotPromise = invokeTraced<StartupGateSnapshot>(IPC_CHANNELS.STARTUP_GET_SNAPSHOT);
ipcRenderer.on(
  IPC_CHANNELS.STARTUP_EVENT_MAIN_READY,
  (_event, payload: StartupMainReadyPayload) => {
    window.dispatchEvent(new Event(APP_STARTUP_MAIN_READY_EVENT));
    for (const cb of mainReadyCallbacks) cb(payload);
  },
);

export const apiBridge: ElectronApi = {
  usb: {
    getDeviceList: (options) => invokeTraced(IPC_CHANNELS.USB_GET_DEVICE_LIST, undefined, options),
  },
  system: {
    ping: (options) => invokeTraced(IPC_CHANNELS.SYSTEM_PING, undefined, options),
    getSystemInfo: (options) => invokeTraced(IPC_CHANNELS.SYSTEM_GET_INFO, undefined, options),
    getPlatform: () => process.platform,
  },
  counter: {
    get: (options) => invokeTraced(IPC_CHANNELS.COUNTER_GET, undefined, options),
    increment: (input: StepInput | undefined, options?: IpcCallOptions) =>
      invokeTraced(IPC_CHANNELS.COUNTER_INCREMENT, input, options),
    decrement: (input: StepInput | undefined, options?: IpcCallOptions) =>
      invokeTraced(IPC_CHANNELS.COUNTER_DECREMENT, input, options),
    reset: (options) => invokeTraced(IPC_CHANNELS.COUNTER_RESET, undefined, options),
  },
  calculator: {
    calculate: (input: CalculateInput, options) =>
      invokeTraced(IPC_CHANNELS.CALCULATOR_CALCULATE, input, options),
  },
  window: {
    onCloseRequested: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on(IPC_CHANNELS.WINDOW_CLOSE_REQUESTED, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_CLOSE_REQUESTED, listener);
      };
    },
    closeReady: () => invokeTraced(IPC_CHANNELS.WINDOW_CLOSE_READY),
    closeRespond: (choice: CloseBehaviorChoice) =>
      invokeTraced(IPC_CHANNELS.WINDOW_CLOSE_RESPOND, choice),
  },
  config: {
    get: (options) => invokeTraced(IPC_CHANNELS.CONFIG_GET, undefined, options),
    update: (input: UpdateConfigInput, options) =>
      invokeTraced(IPC_CHANNELS.CONFIG_UPDATE, input, options),
    reset: (options) => invokeTraced(IPC_CHANNELS.CONFIG_RESET, undefined, options),
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
    openLogFolder: (options) =>
      invokeTraced(IPC_CHANNELS.DIAGNOSTICS_OPEN_LOG_FOLDER, undefined, options),
    performAction: (input: PerformActionInput, options) =>
      invokeTraced(IPC_CHANNELS.DIAGNOSTICS_PERFORM_ACTION, input, options),
  },
  dialog: {
    openFile: (input?: OpenFileInput, options?: IpcCallOptions) =>
      invokeTraced(IPC_CHANNELS.DIALOG_OPEN_FILE, input, options),
    openDirectory: (input?: OpenDirectoryInput, options?: IpcCallOptions) =>
      invokeTraced(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY, input, options),
    saveFile: (input?: SaveFileInput, options?: IpcCallOptions) =>
      invokeTraced(IPC_CHANNELS.DIALOG_SAVE_FILE, input, options),
  },
  shell: {
    showItemInFolder: (input: ShowItemInFolderInput, options) =>
      invokeTraced(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, input, options),
    openExternal: (url: string, options) =>
      invokeTraced(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, url, options),
  },
  updater: {
    getState: (options) => invokeTraced(IPC_CHANNELS.UPDATER_GET_STATE, undefined, options),
    check: (options) => invokeTraced(IPC_CHANNELS.UPDATER_CHECK, undefined, options),
    download: (options) => invokeTraced(IPC_CHANNELS.UPDATER_DOWNLOAD, undefined, options),
    cancel: (options) => invokeTraced(IPC_CHANNELS.UPDATER_CANCEL, undefined, options),
    install: (options) => invokeTraced(IPC_CHANNELS.UPDATER_INSTALL, undefined, options),
    openWindow: (options) => invokeTraced(IPC_CHANNELS.UPDATER_OPEN_WINDOW, undefined, options),
    closeWindow: (options) => invokeTraced(IPC_CHANNELS.UPDATER_CLOSE_WINDOW, undefined, options),
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
  // 启动就绪桥：快照走求值期预取的 Promise，推送回调按注册表分发
  startup: {
    getSnapshot: () => startupSnapshotPromise,
    onMainReady: (cb: (payload: StartupMainReadyPayload) => void) => {
      mainReadyCallbacks.add(cb);
      return () => {
        mainReadyCallbacks.delete(cb);
      };
    },
  },
  // 遵循 specs-electron-fullstack / renderer/ipc-consumption.md 安全规范
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  invokeTraced,
};

contextBridge.exposeInMainWorld('api', apiBridge);
contextBridge.exposeInMainWorld('logger', loggerBridge);
