import type { SpanContext } from '../types/telemetry';

const ALL_ZEROS_TRACE_ID = '00000000000000000000000000000000';
const ALL_ZEROS_SPAN_ID = '0000000000000000';
const TRACE_PARENT_REGEX =
  /^([0-9a-fA-F]{2})-([0-9a-fA-F]{32})-([0-9a-fA-F]{16})-([0-9a-fA-F]{2})$/;

/**
 * 生成指定字节数的加密安全随机十六进制字符串
 */
function getRandomHex(bytes: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const array = new Uint8Array(bytes);
    crypto.getRandomValues(array);
    let hex = '';
    for (let i = 0; i < array.length; i++) {
      hex += array[i].toString(16).padStart(2, '0');
    }
    return hex;
  }
  throw new Error(
    'Secure random number generation (crypto.getRandomValues) is not available in this environment.',
  );
}

/**
 * 生成 16 字节（32 位 Hex）的 W3C TraceId
 */
export function generateTraceId(): string {
  let id = getRandomHex(16).toLowerCase();
  while (id === ALL_ZEROS_TRACE_ID) {
    id = getRandomHex(16).toLowerCase();
  }
  return id;
}

/**
 * 生成 8 字节（16 位 Hex）的 W3C SpanId
 */
export function generateSpanId(): string {
  let id = getRandomHex(8).toLowerCase();
  while (id === ALL_ZEROS_SPAN_ID) {
    id = getRandomHex(8).toLowerCase();
  }
  return id;
}

/**
 * 将 SpanContext 序列化为 W3C traceparent 格式
 * 格式：version-trace_id-parent_id-trace_flags (如 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01)
 */
export function serializeTraceParent(ctx: SpanContext, version = '00'): string {
  const flags = ctx.traceFlags || '01';
  return `${version}-${ctx.traceId.toLowerCase()}-${ctx.spanId.toLowerCase()}-${flags.toLowerCase()}`;
}

/**
 * 解析 W3C traceparent 字符串为 SpanContext，非法格式安全返回 undefined
 */
export function parseTraceParent(traceparent?: string | null): SpanContext | undefined {
  if (!traceparent || typeof traceparent !== 'string') {
    return undefined;
  }

  const trimmed = traceparent.trim();
  const match = trimmed.match(TRACE_PARENT_REGEX);
  if (!match) {
    return undefined;
  }

  const [_, version, traceIdRaw, spanIdRaw, flagsRaw] = match;
  const traceId = traceIdRaw.toLowerCase();
  const spanId = spanIdRaw.toLowerCase();
  const traceFlags = flagsRaw.toLowerCase();

  // W3C 规范：version 00 且未来版本均校验不可全为 0
  if (traceId === ALL_ZEROS_TRACE_ID || spanId === ALL_ZEROS_SPAN_ID) {
    return undefined;
  }

  // 若版本是 ff，按 W3C 规范为非法
  if (version.toLowerCase() === 'ff') {
    return undefined;
  }

  return {
    traceId,
    spanId,
    traceFlags,
  };
}
