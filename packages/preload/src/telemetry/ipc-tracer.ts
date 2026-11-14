import type { IpcCallOptions, TracedIpcPayload } from '@app/shared/types/telemetry';
import {
  generateSpanId,
  generateTraceId,
  serializeTraceParent,
} from '@app/shared/utils/w3c-trace-context';
import { ipcRenderer } from 'electron';

/**
 * 包装 ipcRenderer.invoke，生成 W3C TraceContext 并通过 TracedIpcPayload 跨进程传播
 */
export async function invokeTraced<R = unknown, T = unknown>(
  channel: string,
  data?: T,
  callOptions?: IpcCallOptions,
): Promise<R> {
  const traceId = generateTraceId();
  const spanId = generateSpanId();
  const traceparent = serializeTraceParent({
    traceId,
    spanId,
    traceFlags: '01',
  });

  const payload: TracedIpcPayload<T | undefined> = {
    __trace_carrier: {
      traceparent,
    },
    callOptions,
    data,
  };

  return ipcRenderer.invoke(channel, payload);
}
