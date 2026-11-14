import type { CloseBehaviorChoice } from '../schemas/close-behavior';
import type { AppConfig, UpdateConfigInput } from '../schemas/config';
import type { LogInput, PerformActionInput } from '../schemas/diagnostics';
import type { ShowItemInFolderInput } from '../schemas/shell';
import type { AbortTranslationInput, TranslationInput } from '../schemas/translate';
import type { CardActionPayload } from './card';
import type { ActionResult, OpenLogFolderResult } from './diagnostics';
import type { Result } from './result';
import type { PingResult, SystemInfo } from './system';
import type { IpcCallOptions } from './telemetry';
import type {
  TranslationChunkEvent,
  TranslationErrorEvent,
  TranslationFinishEvent,
} from './translate';
import type { UpdaterProgress, UpdaterSnapshot } from './updater';

/**
 * Window.api 跨端统一契约接口 (ElectronApi)
 */
export interface ElectronApi {
  system: {
    ping: (_payload?: void, options?: IpcCallOptions) => Promise<Result<PingResult>>;
    getSystemInfo: (_payload?: void, options?: IpcCallOptions) => Promise<Result<SystemInfo>>;
    getPlatform: () => string;
  };
  window: {
    onCloseRequested: (cb: () => void) => () => void;
    closeReady: (
      _payload?: void,
      options?: IpcCallOptions,
    ) => Promise<Result<{ success: boolean }>>;
    closeRespond: (
      choice: CloseBehaviorChoice,
      options?: IpcCallOptions,
    ) => Promise<Result<{ success: boolean }>>;
  };
  config: {
    get: (_payload?: void, options?: IpcCallOptions) => Promise<Result<AppConfig>>;
    update: (input: UpdateConfigInput, options?: IpcCallOptions) => Promise<Result<AppConfig>>;
    reset: (_payload?: void, options?: IpcCallOptions) => Promise<Result<AppConfig>>;
    onChanged?: (cb: (config: AppConfig) => void) => () => void;
  };
  diagnostics: {
    log: (input: LogInput, options?: IpcCallOptions) => Promise<Result<{ success: boolean }>>;
    openLogFolder: (
      _payload?: void,
      options?: IpcCallOptions,
    ) => Promise<Result<OpenLogFolderResult>>;
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
    getState: (_payload?: void, options?: IpcCallOptions) => Promise<Result<UpdaterSnapshot>>;
    check: (_payload?: void, options?: IpcCallOptions) => Promise<Result<UpdaterSnapshot>>;
    download: (_payload?: void, options?: IpcCallOptions) => Promise<Result<UpdaterSnapshot>>;
    cancel: (_payload?: void, options?: IpcCallOptions) => Promise<Result<UpdaterSnapshot>>;
    install: (_payload?: void, options?: IpcCallOptions) => Promise<Result<{ success: boolean }>>;
    openWindow: (
      _payload?: void,
      options?: IpcCallOptions,
    ) => Promise<Result<{ success: boolean }>>;
    closeWindow: (
      _payload?: void,
      options?: IpcCallOptions,
    ) => Promise<Result<{ success: boolean }>>;
    /** 返回取消订阅函数，渲染层必须在 useEffect cleanup 中调用 */
    onStateChanged: (cb: (s: UpdaterSnapshot) => void) => () => void;
    onProgressChanged: (cb: (p: UpdaterProgress) => void) => () => void;
  };
  translation: {
    translate: (
      input: TranslationInput,
      options?: IpcCallOptions,
    ) => Promise<Result<{ requestId: string }>>;
    abort: (
      input: AbortTranslationInput,
      options?: IpcCallOptions,
    ) => Promise<Result<{ success: boolean }>>;
    onChunk: (cb: (event: TranslationChunkEvent) => void) => () => void;
    onFinish: (cb: (event: TranslationFinishEvent) => void) => () => void;
    onError: (cb: (event: TranslationErrorEvent) => void) => () => void;
  };
  card: {
    hide: (_payload?: void, options?: IpcCallOptions) => Promise<Result<{ success: boolean }>>;
    resize: (height: number, options?: IpcCallOptions) => Promise<Result<{ success: boolean }>>;
    setPin: (pin: boolean, options?: IpcCallOptions) => Promise<Result<{ success: boolean }>>;
    openInHome: (data?: unknown, options?: IpcCallOptions) => Promise<Result<{ success: boolean }>>;
    onAction: (cb: (payload: CardActionPayload) => void) => () => void;
  };
  // 遵循 specs-electron-fullstack / renderer/ipc-consumption.md 安全规范
  getPathForFile: (file: File) => string;
  invokeTraced?: <R = unknown, T = unknown>(
    channel: string,
    data?: T,
    options?: IpcCallOptions,
  ) => Promise<R>;
}
