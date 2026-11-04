import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { APP_STARTUP_MAIN_READY_EVENT } from '@app/shared/constants/startup';
import type { LogInput, PerformActionInput } from '@app/shared/schemas/diagnostics';
import type { ElectronApi } from '@app/shared/types/api';
import type { StartupGateSnapshot, StartupMainReadyPayload } from '@app/shared/types/startup';
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { loggerBridge } from './logger';

/**
 * ContextBridge 白名单模式（B-01 §5.3 / B-02 §1）：
 * 只暴露 ElectronApi 声明的方法，禁止暴露任意 channel 或 ipcRenderer 本体。
 */
const mainReadyCallbacks = new Set<(payload: StartupMainReadyPayload) => void>();
const startupSnapshotPromise = ipcRenderer.invoke(
  IPC_CHANNELS.STARTUP_GET_SNAPSHOT,
) as Promise<StartupGateSnapshot>;
ipcRenderer.on(IPC_CHANNELS.STARTUP_EVENT_MAIN_READY, (_event, payload) => {
  window.dispatchEvent(new Event(APP_STARTUP_MAIN_READY_EVENT));
  for (const cb of mainReadyCallbacks) cb(payload);
});

export const apiBridge: ElectronApi = {
  system: {
    ping: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_PING),
    getSystemInfo: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_INFO),
    getPlatform: () => process.platform,
  },
  diagnostics: {
    log: (input: LogInput) => ipcRenderer.invoke(IPC_CHANNELS.DIAGNOSTICS_LOG, input),
    openLogFolder: () => ipcRenderer.invoke(IPC_CHANNELS.DIAGNOSTICS_OPEN_LOG_FOLDER),
    performAction: (input: PerformActionInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIAGNOSTICS_PERFORM_ACTION, input),
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
};

contextBridge.exposeInMainWorld('api', apiBridge);
contextBridge.exposeInMainWorld('logger', loggerBridge);
