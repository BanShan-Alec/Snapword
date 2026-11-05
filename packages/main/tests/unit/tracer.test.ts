import { Tracer } from '@app/main/telemetry/tracer';
import type { SpanRecord } from '@app/shared/types/telemetry';
import { describe, expect, it } from 'vitest';

describe('Tracer Core', () => {
  it('manages active context and propagates through async calls', async () => {
    const tracer = new Tracer();
    const records: SpanRecord[] = [];
    tracer.onSpanEnd((record) => records.push(record));

    expect(tracer.getActiveContext()).toBeUndefined();

    await tracer.startActiveSpan('parent.span', undefined, async (parentSpan) => {
      const parentCtx = tracer.getActiveContext();
      expect(parentCtx).toBeDefined();
      expect(parentCtx?.traceId).toBe(parentSpan.context.traceId);
      expect(parentCtx?.spanId).toBe(parentSpan.context.spanId);

      parentSpan.setAttributes({ 'app.version': '1.0.0' });
      parentSpan.addEvent('milestone', { step: 1 });

      await tracer.startActiveSpan('child.span', undefined, async (childSpan) => {
        const childCtx = tracer.getActiveContext();
        expect(childCtx?.traceId).toBe(parentCtx?.traceId);
        expect(childCtx?.spanId).toBe(childSpan.context.spanId);
        expect(childCtx?.parentSpanId).toBe(parentCtx?.spanId);
      });
    });

    expect(tracer.getActiveContext()).toBeUndefined();
    expect(records).toHaveLength(2);

    const childRecord = records[0];
    const parentRecord = records[1];

    expect(childRecord.name).toBe('child.span');
    expect(parentRecord.name).toBe('parent.span');
    expect(childRecord.trace_id).toBe(parentRecord.trace_id);
    expect(childRecord.parent_id).toBe(parentRecord.span_id);
    expect(parentRecord.attributes['app.version']).toBe('1.0.0');
    expect(parentRecord.events).toHaveLength(1);
    expect(parentRecord.events[0].name).toBe('milestone');
  });

  it('records exception and re-throws without swallowing error', async () => {
    const tracer = new Tracer();
    const records: SpanRecord[] = [];
    tracer.onSpanEnd((record) => records.push(record));

    const testError = new Error('boom');

    await expect(
      tracer.startActiveSpan('failing.span', undefined, async () => {
        throw testError;
      }),
    ).rejects.toThrow('boom');

    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.status).toBe('ERROR');
    expect(record.error?.message).toBe('boom');
    expect(record.events.some((e) => e.name === 'exception')).toBe(true);
  });

  it('supports manual spans for long-lived components', () => {
    const tracer = new Tracer();
    const records: SpanRecord[] = [];
    tracer.onSpanEnd((record) => records.push(record));

    const manualSpan = tracer.startManualSpan('manual.lifecycle', {
      attributes: { component: 'window' },
    });
    manualSpan.addEvent('created');
    manualSpan.addEvent('ready');
    const record = manualSpan.end('OK');

    expect(record.name).toBe('manual.lifecycle');
    expect(record.status).toBe('OK');
    expect(record.events).toHaveLength(2);
    expect(records).toHaveLength(1);
    expect(records[0]).toBe(record);
  });

  it('omits successful spans when success recording is disabled', async () => {
    const tracer = new Tracer();
    const records: string[] = [];
    tracer.onSpanEnd((record) => records.push(record.name));

    await tracer.startActiveSpan(
      'ipc.receive:system:get-info',
      { recordSuccess: false },
      () => 'ok',
    );

    expect(records).toEqual([]);
  });

  it('still records errors when success recording is disabled', async () => {
    const tracer = new Tracer();
    const records: string[] = [];
    tracer.onSpanEnd((record) => records.push(`${record.name}:${record.status}`));

    await expect(
      tracer.startActiveSpan('ipc.receive:system:get-info', { recordSuccess: false }, () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');

    expect(records).toEqual(['ipc.receive:system:get-info:ERROR']);
  });

  it('still records a Result failure when success recording is disabled', async () => {
    const tracer = new Tracer();
    const statuses: string[] = [];
    tracer.onSpanEnd((record) => statuses.push(record.status));

    await tracer.startActiveSpan(
      'ipc.receive:system:get-info',
      { recordSuccess: false },
      (span) => {
        span.setStatus('ERROR');
        return { success: false };
      },
    );

    expect(statuses).toEqual(['ERROR']);
  });

  it('extracts and injects W3C traceparent correctly', () => {
    const tracer = new Tracer();
    const carrier = {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    };

    const extracted = tracer.extract(carrier);
    expect(extracted).toBeDefined();
    expect(extracted?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(extracted?.spanId).toBe('00f067aa0ba902b7');

    const outCarrier: Record<string, string> = {};
    tracer.startActiveSpan('with.extracted', { parentContext: extracted }, () => {
      tracer.inject(outCarrier);
    });

    expect(outCarrier.traceparent).toMatch(/^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/);
  });
});
