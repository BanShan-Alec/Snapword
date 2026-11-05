import { APP_ENV } from '@app/shared/constants/env';
import type { IpcCallOptions } from '@app/shared/types/telemetry';
import type { Result } from '@shared/types/result';

/**
 * IPC 失败语义化错误：保留主进程 Result 契约中的 code，调用方可按错误码分支（如 DIVIDE_BY_ZERO），
 * 而不是解析错误文案。
 */
export class IpcError extends Error {
  readonly code?: string;
  readonly traceId?: string;

  constructor(message: string, code?: string, traceId?: string) {
    super(message);
    this.name = 'IpcError';
    this.code = code;
    this.traceId = traceId;
  }
}

// 私有常量
const IPC_LOG_PREFIX = '[ipc]';

// 可抽离的逻辑处理函数/组件
/**
 * 日志纪律：只记录 channel / 结果 / 耗时。
 * 成功行仅 dev 走 console（DevTools 观察，不落盘避免每次交互都产生文件行）；
 * 失败行走 logger——dev 附原始错误对象回显 + 落盘，生产一行带错误文案（code 不落盘），
 * 磁盘可查哪个 IPC 为什么失败过。
 * 严禁打印入参 body——config 含本地路径、dialog 含 URL。
 */
function logIpc(
  channel: string,
  ok: boolean,
  durationMs: number,
  error?: unknown,
  traceId?: string,
  recordSuccess = true,
) {
  const isDev = window.__APP_ENV__?.mode === APP_ENV.DEVELOPMENT;
  const cost = `${durationMs.toFixed(1)}ms`;
  if (ok) {
    if (isDev && recordSuccess) {
      console.info(`${IPC_LOG_PREFIX} ${channel} ok ${cost}`);
    }
    return;
  }
  const line = `${IPC_LOG_PREFIX} ${channel} failed ${cost}`;
  const targetLogger =
    traceId && typeof logger.withTrace === 'function' ? logger.withTrace(traceId) : logger;
  const traceMarker = traceId ? { __trace_id: traceId } : undefined;

  if (isDev) {
    if (traceMarker) {
      targetLogger.error(line, error, traceMarker);
    } else {
      targetLogger.error(line, error);
    }
    return;
  }
  const reason = error instanceof Error ? error.message : String(error);
  if (traceMarker) {
    targetLogger.error(`${line}: ${reason}`, traceMarker);
  } else {
    targetLogger.error(`${line}: ${reason}`);
  }
}

type IpcService<TData, TParams extends unknown[]> = (...args: TParams) => Promise<Result<TData>>;

/**
 * 统一的 IPC 调用原语：Result 解构 + 计时 + 日志。
 * 成功返回解构后的 data，失败抛 IpcError（保留 code 与 traceId）。
 * feature 内禁止手写 window.api.* + if (!res.success)，一律经由本函数或 hooks/useIpc.ts。
 *
 * 参数契约：`args` 只包含业务参数，options 由本函数统一追加在末尾；
 * 调用方不得把 options 混进 args。业务参数本身可能声明为可选（如 counter.increment(input?)），
 * 省略时先用 undefined 占位，保证 recordSuccess 永远落在 options 位置。
 */
export async function callIpc<TData, TParams extends unknown[]>(
  channel: string,
  service: IpcService<TData, TParams>,
  args: TParams,
  options: IpcCallOptions = {},
): Promise<TData> {
  const startedAt = performance.now();
  let traceId: string | undefined;
  try {
    const callArgs: unknown[] = [...args];
    if (options.recordSuccess === false) {
      // options 是最后一个可选参数（不得写成默认参数，否则 service.length 失真）
      while (callArgs.length < Math.max(0, service.length - 1)) callArgs.push(undefined);
      callArgs.push({ recordSuccess: false });
    }
    const res = await service(...(callArgs as TParams));
    traceId = res.traceId;
    if (!res.success) {
      throw new IpcError(res.error, res.code, res.traceId);
    }
    logIpc(channel, true, performance.now() - startedAt, undefined, traceId, options.recordSuccess);
    return res.data;
  } catch (error) {
    const effectiveTraceId = error instanceof IpcError ? (error.traceId ?? traceId) : traceId;
    logIpc(channel, false, performance.now() - startedAt, error, effectiveTraceId);
    throw error;
  }
}
