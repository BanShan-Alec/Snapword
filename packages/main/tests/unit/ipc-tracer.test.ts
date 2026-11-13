import { isTracedIpcPayload } from '@app/main/telemetry/ipc-tracer';
import { getTracer } from '@app/main/telemetry/tracer';
import type { SpanContext, SpanRecord, TracedIpcPayload } from '@app/shared/types/telemetry';
import { describe, expect, it } from 'vitest';

describe('IPC Tracer Contract', () => {
  it('correctly detects TracedIpcPayload', () => {
    const validPayload: TracedIpcPayload<{ num: number }> = {
      __trace_carrier: {
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
      data: { num: 42 },
    };

    expect(isTracedIpcPayload(validPayload)).toBe(true);
    expect(isTracedIpcPayload({ data: 42 })).toBe(false);
    expect(isTracedIpcPayload(null)).toBe(false);
    expect(isTracedIpcPayload('string')).toBe(false);
    expect(isTracedIpcPayload(undefined)).toBe(false);
  });

  it('derives the parent context from the carrier and falls back when it is missing', async () => {
    const tracer = getTracer();
    const parentTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const clientSpanId = '00f067aa0ba902b7';
    const payload: TracedIpcPayload<string> = {
      __trace_carrier: { traceparent: `00-${parentTraceId}-${clientSpanId}-01` },
      data: 'test-data',
    };

    const parentContext = tracer.extract(
      payload.__trace_carrier as Record<string, string | undefined>,
    );
    let tracedContext: SpanContext | undefined;
    await tracer.startActiveSpan('ipc.receive:test', { parentContext }, async () => {
      tracedContext = tracer.getActiveContext();
    });

    // 因果关系验证：主进程内部操作的 parent_id 必须严格等于 IPC 传入的客户端 span_id
    expect(tracedContext?.traceId).toBe(parentTraceId);
    expect(tracedContext?.parentSpanId).toBe(clientSpanId);

    let untracedContext: SpanContext | undefined;
    await tracer.startActiveSpan('ipc.receive:untraced', { parentContext: undefined }, async () => {
      untracedContext = tracer.getActiveContext();
    });

    expect(untracedContext?.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(untracedContext?.parentSpanId).toBeUndefined();
  });

  it('marks span as ERROR when setStatus("ERROR") is called', async () => {
    const tracer = getTracer();
    let capturedRecord: SpanRecord | undefined;
    const unsubscribe = tracer.onSpanEnd((record) => {
      if (record.name === 'test.error.span') {
        capturedRecord = record;
      }
    });

    try {
      await tracer.startActiveSpan('test.error.span', undefined, async (span) => {
        span.setStatus('ERROR');
        return { success: false };
      });
    } finally {
      // 断言失败也必须注销，避免污染同进程内后续用例
      unsubscribe();
    }

    expect(capturedRecord?.status).toBe('ERROR');
  });
});
