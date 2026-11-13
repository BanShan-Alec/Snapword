/**
 * 渲染进程全局 logger 契约：contextBridge 暴露为 window.logger，
 * 并经 env.d.ts 的 declare const 支持裸调用（logger.info(...)）。
 * 形态与主进程 IScopedLogger 逐字一致——方法名即级别、变参、同步 void；
 * 每次调用双写：DevTools 回显（原生 console）+ diagnostics:log 通道落盘，fire-and-forget，
 * 调用方不感知 IPC 成败；debug 级仅开发构建生效。
 */
export type ILogMethod = (message: string, ...args: unknown[]) => void;

export interface IScopedTraceLogger {
  info: ILogMethod;
  warn: ILogMethod;
  error: ILogMethod;
  debug: ILogMethod;
}

export interface LoggerApi {
  info: ILogMethod;
  warn: ILogMethod;
  error: ILogMethod;
  debug: ILogMethod;
  withTrace: (traceId: string, spanId?: string) => IScopedTraceLogger;
}
