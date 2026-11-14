export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceFlags: string;
}

export interface SpanEvent {
  name: string;
  time_ms: number;
  attributes?: Record<string, string | number | boolean>;
}

export interface SpanRecord {
  type: 'span';
  name: string;
  trace_id: string;
  span_id: string;
  parent_id?: string;
  start_time: number; // Unix epoch ms
  duration_ms: number; // 毫秒，高精度浮点
  status: 'OK' | 'ERROR';
  error?: {
    type?: string;
    message: string;
    stack?: string;
  };
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
}

export interface TraceCarrier {
  traceparent?: string;
}

export interface IpcCallOptions {
  recordSuccess?: boolean;
}

export interface TracedIpcPayload<T = unknown> {
  __trace_carrier?: TraceCarrier;
  callOptions?: IpcCallOptions;
  data: T;
}

export interface EnrichedLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  trace_id?: string;
  span_id?: string;
  attributes?: Record<string, unknown>;
}
