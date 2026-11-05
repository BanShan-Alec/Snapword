import type { SupportedLocale } from '../constants/preferences';
import type { LogInput, PerformActionInput } from '../schemas/diagnostics';
import type { ActionResult, OpenLogFolderResult } from './diagnostics';
import type { Result } from './result';
import type { StartupGateSnapshot, StartupMainReadyPayload } from './startup';
import type { PingResult, SystemInfo } from './system';
import type { IpcCallOptions } from './telemetry';

/**
 * Window.api 跨端统一契约接口 (ElectronApi)
 *
 * ContextBridge 白名单模式：preload 只暴露这里声明的方法，
 * 渲染进程禁止 require/fs/child_process（B-01 §3 硬边界 3）。
 */
export interface ElectronApi {
  system: {
    ping: (options?: IpcCallOptions) => Promise<Result<PingResult>>;
    getSystemInfo: (options?: IpcCallOptions) => Promise<Result<SystemInfo>>;
    getPlatform: () => string;
    /** 语言切换后通知主进程重建托盘文案（RM-13） */
    setLocale: (
      locale: SupportedLocale,
      options?: IpcCallOptions,
    ) => Promise<Result<{ success: boolean }>>;
  };
  diagnostics: {
    // 架构豁免：日志管道是裸 invoke，不携带 TracedIpcPayload（主进程按裸 LogInput 校验）
    log: (input: LogInput) => Promise<Result<{ success: boolean }>>;
    openLogFolder: (options?: IpcCallOptions) => Promise<Result<OpenLogFolderResult>>;
    performAction: (
      input: PerformActionInput,
      options?: IpcCallOptions,
    ) => Promise<Result<ActionResult>>;
  };
  startup: {
    /** 引导期一次性快照拉取（主进程闩锁，先到信号经此补发） */
    getSnapshot: () => Promise<StartupGateSnapshot>;
    /** 主进程就绪单向推送订阅；同时派发跨世界 DOM 事件；返回取消订阅函数 */
    onMainReady?: (cb: (payload: StartupMainReadyPayload) => void) => () => void;
  };
  // 遵循 Electron 安全规范：webUtils.getPathForFile 是渲染层获取文件真实路径的唯一合法途径
  getPathForFile: (file: File) => string;
  invokeTraced?: <R = unknown, T = unknown>(
    channel: string,
    data?: T,
    options?: IpcCallOptions,
  ) => Promise<R>;
}
