import { APP_ENV } from '@app/shared/constants/env';
import type { ElectronApi } from '@app/shared/types/api';
import type { Result } from '@app/shared/types/result';
import type { IpcCallOptions } from '@app/shared/types/telemetry';

/**
 * 提取 ElectronApi 中所有返回 Promise<Result<any>> 的两级 IPC 点分路径
 */
export type IpcApiPath = {
  [K in keyof ElectronApi & string]: {
    [M in keyof ElectronApi[K] & string]: ElectronApi[K][M] extends (
      // 参数逆变位用 never[] 可匹配任意函数签名，替代 any
      ...args: never[]
    ) => Promise<Result<unknown>>
      ? `${K}.${M}`
      : never;
  }[keyof ElectronApi[K] & string];
}[keyof ElectronApi & string];

/**
 * 根据点分路径获取对应的原始服务函数类型
 */
export type IpcApiService<P extends IpcApiPath> = P extends `${infer Domain}.${infer Method}`
  ? Domain extends keyof ElectronApi
    ? Method extends keyof ElectronApi[Domain]
      ? ElectronApi[Domain][Method]
      : never
    : never
  : never;

/**
 * 从函数入参中剥离末尾可选的 IpcCallOptions，提取纯业务入参
 */
type DropTrailingIpcOptions<T extends readonly unknown[]> = T extends readonly [
  ...infer Lead,
  (IpcCallOptions | undefined)?,
]
  ? Lead
  : T;

export type IpcApiParams<P extends IpcApiPath> =
  IpcApiService<P> extends (...args: infer Args) => unknown ? DropTrailingIpcOptions<Args> : [];

export type IpcApiData<P extends IpcApiPath> =
  IpcApiService<P> extends (...args: never[]) => Promise<Result<infer TData>> ? TData : never;

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

/**
 * 包含单个业务入参（非仅 options）的 IPC API 点分路径集合。
 * 运行时在 contextIsolation 桥接后，函数经 contextBridge 包装会导致 service.length 丢失为 0；
 * 此处显式声明单参数通道，确保当 recordSuccess === false 且调用方省略可选参数时，
 * 仍能正确在 options 位置前填充 undefined 占位，避免 options 错位传递给业务参数。
 */
const SINGLE_PAYLOAD_PATHS = new Set<IpcApiPath>([
  'calculator.calculate',
  'config.update',
  'counter.decrement',
  'counter.increment',
  'diagnostics.log',
  'diagnostics.performAction',
  'dialog.openDirectory',
  'dialog.openFile',
  'dialog.saveFile',
  'shell.openExternal',
  'shell.showItemInFolder',
  'window.closeRespond',
]);

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

/**
 * 统一的 IPC 调用原语：根据点分路径动态寻址 window.api + Result 解构 + 计时 + 日志。
 * 成功返回解构后的 data，失败抛 IpcError（保留 code 与 traceId）。
 * feature 内禁止手写 window.api.* + if (!res.success)，一律经由本函数或 hooks/useIpc.ts。
 *
 * 参数契约：`args` 只包含业务参数，options 由本函数统一追加在末尾；
 * 无参方法可省略 `args`。业务参数本身可能声明为可选（如 counter.increment(input?)），
 * 省略时先用 undefined 占位，保证 recordSuccess 永远落在 options 位置。
 */
export async function callIpc<P extends IpcApiPath>(
  path: P,
  args?: IpcApiParams<P>,
  options: IpcCallOptions = {},
): Promise<IpcApiData<P>> {
  const parts = path.split('.');
  if (parts.length !== 2) {
    throw new Error(`[callIpc] Invalid IPC API path format: "${path}". Expected "domain.method"`);
  }
  const [domain, method] = parts as [keyof ElectronApi, string];
  const domainApi = window.api?.[domain] as
    | Record<string, (...args: unknown[]) => unknown>
    | undefined;
  const service = domainApi?.[method];

  if (typeof service !== 'function') {
    throw new Error(`[callIpc] Unknown IPC API method for path: "${path}"`);
  }

  const startedAt = performance.now();
  let traceId: string | undefined;
  try {
    const callArgs: unknown[] = args ? [...args] : [];
    if (options.recordSuccess === false) {
      // options 是最后一个可选参数（不得写成默认参数，否则 service.length 失真；且 contextBridge 下 length 为 0）
      const expectedLeadCount = SINGLE_PAYLOAD_PATHS.has(path) ? 1 : 0;
      const targetPadding = Math.max(expectedLeadCount, service.length - 1);
      while (callArgs.length < targetPadding) callArgs.push(undefined);
      callArgs.push({ recordSuccess: false });
    }
    const res = (await service.apply(domainApi, callArgs)) as Result<IpcApiData<P>>;
    traceId = res.traceId;
    if (!res.success) {
      throw new IpcError(res.error, res.code, res.traceId);
    }
    logIpc(path, true, performance.now() - startedAt, undefined, traceId, options.recordSuccess);
    return res.data;
  } catch (error) {
    const effectiveTraceId = error instanceof IpcError ? (error.traceId ?? traceId) : traceId;
    logIpc(path, false, performance.now() - startedAt, error, effectiveTraceId);
    throw error;
  }
}
