import type { LogInput, PerformActionInput } from '../schemas/diagnostics';
import type { ActionResult, OpenLogFolderResult } from './diagnostics';
import type { Result } from './result';
import type { StartupGateSnapshot, StartupMainReadyPayload } from './startup';
import type { PingResult, SystemInfo } from './system';

/**
 * Window.api 跨端统一契约接口 (ElectronApi)
 *
 * ContextBridge 白名单模式：preload 只暴露这里声明的方法，
 * 渲染进程禁止 require/fs/child_process（B-01 §3 硬边界 3）。
 */
export interface ElectronApi {
  system: {
    ping: () => Promise<Result<PingResult>>;
    getSystemInfo: () => Promise<Result<SystemInfo>>;
    getPlatform: () => string;
  };
  diagnostics: {
    log: (input: LogInput) => Promise<Result<{ success: boolean }>>;
    openLogFolder: () => Promise<Result<OpenLogFolderResult>>;
    performAction: (input: PerformActionInput) => Promise<Result<ActionResult>>;
  };
  startup: {
    /** 引导期一次性快照拉取（主进程闩锁，先到信号经此补发） */
    getSnapshot: () => Promise<StartupGateSnapshot>;
    /** 主进程就绪单向推送订阅；同时派发跨世界 DOM 事件；返回取消订阅函数 */
    onMainReady?: (cb: (payload: StartupMainReadyPayload) => void) => () => void;
  };
  // 遵循 Electron 安全规范：webUtils.getPathForFile 是渲染层获取文件真实路径的唯一合法途径
  getPathForFile: (file: File) => string;
}
