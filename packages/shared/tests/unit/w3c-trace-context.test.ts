import {
  generateSpanId,
  generateTraceId,
  parseTraceParent,
  serializeTraceParent,
} from '@app/shared/utils/w3c-trace-context';
import { describe, expect, it } from 'vitest';

describe('W3C TraceContext Codec', () => {
  it('generates valid 32-hex traceId and 16-hex spanId', () => {
    const traceId = generateTraceId();
    const spanId = generateSpanId();

    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(traceId).not.toBe('00000000000000000000000000000000');
    expect(spanId).not.toBe('0000000000000000');
  });

  it('serializes and parses valid traceparent roundtrip', () => {
    const traceId = generateTraceId();
    const spanId = generateSpanId();
    const serialized = serializeTraceParent({
      traceId,
      spanId,
      traceFlags: '01',
    });

    expect(serialized).toBe(`00-${traceId}-${spanId}-01`);

    const parsed = parseTraceParent(serialized);
    expect(parsed).toEqual({
      traceId,
      spanId,
      traceFlags: '01',
    });
  });

  it('handles uppercase input gracefully', () => {
    const traceparent = '00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01';
    const parsed = parseTraceParent(traceparent);

    expect(parsed).toEqual({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: '01',
    });
  });

  it('rejects invalid or malformed traceparents', () => {
    expect(parseTraceParent(undefined)).toBeUndefined();
    expect(parseTraceParent('')).toBeUndefined();
    expect(parseTraceParent('invalid-string')).toBeUndefined();
    // all zeros
    expect(
      parseTraceParent('00-00000000000000000000000000000000-00f067aa0ba902b7-01'),
    ).toBeUndefined();
    expect(
      parseTraceParent('00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01'),
    ).toBeUndefined();
    // illegal version ff
    expect(
      parseTraceParent('ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'),
    ).toBeUndefined();
    // wrong lengths
    expect(parseTraceParent('00-4bf92f35-00f067aa0ba902b7-01')).toBeUndefined();
  });
});
