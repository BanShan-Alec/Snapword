// @sentry/electron/preload 通过 vite.config.ts 的 ssr.noExternal: true 完全内联打包进 dist/index.cjs，
// 运行时零外部依赖，故作为 devDependencies 安装与管理
import '@sentry/electron/preload';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { APP_STARTUP_MAIN_READY_EVENT } from '@app/shared/constants/startup';
import type { LogInput, PerformActionInput } from '@app/shared/schemas/diagnostics';
import type { ElectronApi } from '@app/shared/types/api';
import type { AppRuntimeEnv } from '@app/shared/types/env';
import type { StartupGateSnapshot, StartupMainReadyPayload } from '@app/shared/types/startup';
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

/**
 * ContextBridge 白名单模式（B-01 §5.3 / B-02 §1）：
 * 只暴露 ElectronApi 声明的方法，禁止暴露任意 channel 或 ipcRenderer 本体。
 */
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
  system: {
    ping: (options) => invokeTraced(IPC_CHANNELS.SYSTEM_PING, undefined, options),
    getSystemInfo: (options) => invokeTraced(IPC_CHANNELS.SYSTEM_GET_INFO, undefined, options),
    getPlatform: () => process.platform,
    setLocale: (locale, options) => invokeTraced(IPC_CHANNELS.SYSTEM_SET_LOCALE, locale, options),
  },
  diagnostics: {
    // 架构豁免：日志管道保持裸 invoke，与主进程裸 ipcMain.handle + LogInput 校验配对
    log: (input: LogInput) => ipcRenderer.invoke(IPC_CHANNELS.DIAGNOSTICS_LOG, input),
    openLogFolder: (options) =>
      invokeTraced(IPC_CHANNELS.DIAGNOSTICS_OPEN_LOG_FOLDER, undefined, options),
    performAction: (input: PerformActionInput, options) =>
      invokeTraced(IPC_CHANNELS.DIAGNOSTICS_PERFORM_ACTION, input, options),
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
  // 遵循 Electron 安全规范：渲染层获取文件真实路径的唯一合法途径
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  invokeTraced,
};

contextBridge.exposeInMainWorld('api', apiBridge);
contextBridge.exposeInMainWorld('logger', loggerBridge);
