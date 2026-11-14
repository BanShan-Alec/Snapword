import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import type { LogInput } from '@app/shared/schemas/diagnostics';
import type { ILogMethod, IScopedTraceLogger, LoggerApi } from '@app/shared/types/logger';
import { ipcRenderer } from 'electron';
import { resolveIsDev } from './env';

const MAX_ARG_DEPTH = 5;
const isDev = resolveIsDev();

/** 原生 console 引用：回显必须走未包装的原生方法，杜绝与未来任何 console 改动相互递归 */
const nativeConsole = {
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
} as const;

/**
 * 把任意调用参数转成 structured clone 安全值：
 * Error / function / symbol / bigint 等不可克隆类型降级为可读表示，循环引用与超深结构截断。
 * 转换后的结构原样过 IPC，由主进程 util.format 统一格式化——这是 console 变参手感的关键。
 */
function toCloneSafe(value: unknown, depth = 0, ancestors = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;

  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return value;
    case 'bigint':
      return `${value}n`;
    case 'symbol':
      return value.toString();
    case 'function':
      return `[Function ${(value as { name?: string }).name || 'anonymous'}]`;
  }

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  // 以下类型可被 structured clone 原生保留，且 util.inspect 有对应可读渲染
  if (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Map ||
    value instanceof Set
  ) {
    return value;
  }
  if (depth >= MAX_ARG_DEPTH) return '[max depth]';
  if (ancestors.has(value as object)) return '[Circular]';

  ancestors.add(value as object);
  const converted = Array.isArray(value)
    ? value.map((item) => toCloneSafe(item, depth + 1, ancestors))
    : Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          toCloneSafe(item, depth + 1, ancestors),
        ]),
      );
  ancestors.delete(value as object);
  return converted;
}

function toCloneSafeArgs(args: unknown[]): unknown[] | undefined {
  if (args.length === 0) return undefined;
  return args.map((arg) => toCloneSafe(arg));
}

interface TraceMarker {
  __trace_id?: string;
  __span_id?: string;
}

function isTraceMarker(arg: unknown): arg is TraceMarker {
  return typeof arg === 'object' && arg !== null && '__trace_id' in arg;
}

const emitWithContext =
  (scopedTraceId?: string, scopedSpanId?: string) =>
  (level: LogInput['level']): ILogMethod =>
  (message: string, ...args: unknown[]): void => {
    // debug 仅开发构建生效：生产排障靠 info/warn/error，高频细节不进文件也不回显
    if (level === 'debug' && !isDev) return;

    let finalTraceId = scopedTraceId;
    let finalSpanId = scopedSpanId;
    const cleanArgs = [...args];

    // 支持通过最后一个入参携带 { __trace_id, __span_id } 提取 Trace 并剥离
    const lastArg = cleanArgs[cleanArgs.length - 1];
    if (isTraceMarker(lastArg)) {
      cleanArgs.pop();
      if (!finalTraceId) finalTraceId = lastArg.__trace_id;
      if (!finalSpanId) finalSpanId = lastArg.__span_id;
    }

    // 第一份：原生 console 回显 + 原始 args——DevTools 里对象可交互展开，与手写 console 体验一致。
    // 主进程侧节流只作用于落盘，不回显：被丢弃的日志在 DevTools 仍可见
    nativeConsole[level](message, ...cleanArgs);

    // 第二份：clone 安全预处理后经 diagnostics:log 落盘（静默管道，不生成独立 traceparent）
    const payload: LogInput = {
      level,
      message,
      args: toCloneSafeArgs(cleanArgs),
      traceId: finalTraceId,
      spanId: finalSpanId,
    };
    void ipcRenderer.invoke(IPC_CHANNELS.DIAGNOSTICS_LOG, payload).catch(() => {
      // fire-and-forget：日志管道自身的故障不向业务调用方传播
    });
  };

const createScopedLogger = (traceId?: string, spanId?: string): IScopedTraceLogger => {
  const getEmit = emitWithContext(traceId, spanId);
  return {
    info: getEmit('info'),
    warn: getEmit('warn'),
    error: getEmit('error'),
    debug: getEmit('debug'),
  };
};

const defaultScoped = createScopedLogger();

/**
 * 平行于 window.api 的日志桥：方法名即级别、变参、同步 void，调用形态与 console 一致。
 * 每次调用双写——DevTools 回显（原生 console）+ renderer-<window>.log 落盘。
 */
export const loggerBridge: LoggerApi = {
  info: defaultScoped.info,
  warn: defaultScoped.warn,
  error: defaultScoped.error,
  debug: defaultScoped.debug,
  withTrace: (traceId: string, spanId?: string) => createScopedLogger(traceId, spanId),
};
