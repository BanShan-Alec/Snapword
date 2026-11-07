import type { CloseBehaviorChoice } from '../schemas/close-behavior';
import type { AppConfig, UpdateConfigInput } from '../schemas/config';
import type { LogInput, PerformActionInput } from '../schemas/diagnostics';
import type { ShowItemInFolderInput } from '../schemas/shell';
import type { ActionResult, OpenLogFolderResult } from './diagnostics';
import type { Result } from './result';
import type { StartupGateSnapshot, StartupMainReadyPayload } from './startup';
import type { PingResult, SystemInfo } from './system';
import type { IpcCallOptions } from './telemetry';
import type { UpdaterProgress, UpdaterSnapshot } from './updater';

/**
 * Window.api 跨端统一契约接口 (ElectronApi)
 */
export interface ElectronApi {
  system: {
    ping: (options?: IpcCallOptions) => Promise<Result<PingResult>>;
    getSystemInfo: (options?: IpcCallOptions) => Promise<Result<SystemInfo>>;
    getPlatform: () => string;
  };
  window: {
    onCloseRequested: (cb: () => void) => () => void;
    closeReady: () => Promise<Result<{ success: boolean }>>;
    closeRespond: (choice: CloseBehaviorChoice) => Promise<Result<{ success: boolean }>>;
  };
  config: {
    get: (options?: IpcCallOptions) => Promise<Result<AppConfig>>;
    update: (input: UpdateConfigInput, options?: IpcCallOptions) => Promise<Result<AppConfig>>;
    reset: (options?: IpcCallOptions) => Promise<Result<AppConfig>>;
    onChanged?: (cb: (config: AppConfig) => void) => () => void;
  };
  diagnostics: {
    log: (input: LogInput, options?: IpcCallOptions) => Promise<Result<{ success: boolean }>>;
    openLogFolder: (options?: IpcCallOptions) => Promise<Result<OpenLogFolderResult>>;
    performAction: (
      input: PerformActionInput,
      options?: IpcCallOptions,
    ) => Promise<Result<ActionResult>>;
  };
  shell: {
    showItemInFolder: (
      input: ShowItemInFolderInput,
      options?: IpcCallOptions,
    ) => Promise<Result<{ success: boolean }>>;
    openExternal: (url: string, options?: IpcCallOptions) => Promise<Result<{ success: boolean }>>;
  };
  updater: {
    getState: (options?: IpcCallOptions) => Promise<Result<UpdaterSnapshot>>;
    check: (options?: IpcCallOptions) => Promise<Result<UpdaterSnapshot>>;
    download: (options?: IpcCallOptions) => Promise<Result<UpdaterSnapshot>>;
    cancel: (options?: IpcCallOptions) => Promise<Result<UpdaterSnapshot>>;
    install: (options?: IpcCallOptions) => Promise<Result<{ success: boolean }>>;
    openWindow: (options?: IpcCallOptions) => Promise<Result<{ success: boolean }>>;
    closeWindow: (options?: IpcCallOptions) => Promise<Result<{ success: boolean }>>;
    /** 返回取消订阅函数，渲染层必须在 useEffect cleanup 中调用 */
    onStateChanged: (cb: (s: UpdaterSnapshot) => void) => () => void;
    onProgressChanged: (cb: (p: UpdaterProgress) => void) => () => void;
  };
  startup: {
    /** 引导期一次性快照拉取（主进程闩锁，先到信号经此补发，spec §4.6） */
    getSnapshot: () => Promise<StartupGateSnapshot>;
    /** 主进程就绪单向推送订阅；同时派发跨世界 DOM 事件；返回取消订阅函数 */
    onMainReady?: (cb: (payload: StartupMainReadyPayload) => void) => () => void;
  };
  // 遵循 specs-electron-fullstack / renderer/ipc-consumption.md 安全规范
  getPathForFile: (file: File) => string;
  invokeTraced?: <R = unknown, T = unknown>(
    channel: string,
    data?: T,
    options?: IpcCallOptions,
  ) => Promise<R>;
}
