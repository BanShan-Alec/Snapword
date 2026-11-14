import { AsyncLocalStorage } from 'node:async_hooks';
import type { SpanContext, SpanEvent, SpanRecord } from '@app/shared/types/telemetry';
import {
  generateSpanId,
  generateTraceId,
  parseTraceParent,
  serializeTraceParent,
} from '@app/shared/utils/w3c-trace-context';

export interface ISpanScope {
  readonly context: SpanContext;
  setStatus(status: 'OK' | 'ERROR'): void;
  setAttributes(attrs: Record<string, string | number | boolean>): void;
  addEvent(name: string, attrs?: Record<string, string | number | boolean>): void;
  recordException(err: unknown): void;
}

export interface IManualSpan extends ISpanScope {
  end(status?: 'OK' | 'ERROR'): SpanRecord;
}

export interface SpanOptions {
  attributes?: Record<string, string | number | boolean>;
  parentContext?: SpanContext;
  recordSuccess?: boolean;
}

export type SpanEndListener = (record: SpanRecord) => void;

export interface ITracer {
  getActiveContext(): SpanContext | undefined;
  startActiveSpan<T>(
    name: string,
    options: SpanOptions | undefined,
    fn: (span: ISpanScope) => Promise<T> | T,
  ): Promise<T>;
  startManualSpan(name: string, options?: SpanOptions): IManualSpan;
  extract(carrier?: Record<string, string | undefined>): SpanContext | undefined;
  inject(carrier: Record<string, string>): void;
  onSpanEnd(listener: SpanEndListener): () => void;
}

export class Tracer implements ITracer {
  private readonly storage = new AsyncLocalStorage<SpanContext>();
  private readonly listeners = new Set<SpanEndListener>();

  public getActiveContext(): SpanContext | undefined {
    return this.storage.getStore();
  }

  public onSpanEnd(listener: SpanEndListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifySpanEnd(record: SpanRecord): void {
    for (const listener of this.listeners) {
      try {
        listener(record);
      } catch (err) {
        // 规避监听器内部异常扰乱业务执行
        console.error('[Tracer] listener error:', err);
      }
    }
  }

  public extract(carrier?: Record<string, string | undefined>): SpanContext | undefined {
    if (!carrier || typeof carrier !== 'object') {
      return undefined;
    }
    // 不区分大小写查找 traceparent
    for (const key of Object.keys(carrier)) {
      if (key.toLowerCase() === 'traceparent') {
        const val = carrier[key];
        if (typeof val === 'string') {
          return parseTraceParent(val);
        }
      }
    }
    return undefined;
  }

  public inject(carrier: Record<string, string>): void {
    const active = this.getActiveContext();
    if (active && carrier && typeof carrier === 'object') {
      carrier.traceparent = serializeTraceParent(active);
    }
  }

  public startManualSpan(name: string, options?: SpanOptions): IManualSpan {
    const parentContext = options?.parentContext ?? this.getActiveContext();
    const traceId = parentContext ? parentContext.traceId : generateTraceId();
    const parent_id = parentContext ? parentContext.spanId : undefined;
    const spanId = generateSpanId();
    const traceFlags = parentContext ? parentContext.traceFlags : '01';

    const context: SpanContext = {
      traceId,
      spanId,
      parentSpanId: parent_id,
      traceFlags,
    };

    const startTime = Date.now();
    const startPerf = performance.now();
    const attributes: Record<string, string | number | boolean> = {
      ...(options?.attributes ?? {}),
    };
    const events: SpanEvent[] = [];
    let status: 'OK' | 'ERROR' = 'OK';
    let errorDetail: SpanRecord['error'];
    let ended = false;

    const spanScope: IManualSpan = {
      context,
      setStatus(newStatus) {
        status = newStatus;
      },
      setAttributes(attrs) {
        Object.assign(attributes, attrs);
      },
      addEvent(eventName, attrs) {
        events.push({
          name: eventName,
          time_ms: Date.now(),
          attributes: attrs ? { ...attrs } : undefined,
        });
      },
      recordException(err) {
        status = 'ERROR';
        if (err instanceof Error) {
          errorDetail = {
            type: err.name,
            message: err.message,
            stack: err.stack,
          };
          events.push({
            name: 'exception',
            time_ms: Date.now(),
            attributes: {
              'exception.type': err.name,
              'exception.message': err.message,
            },
          });
        } else {
          const str = String(err);
          errorDetail = { message: str };
          events.push({
            name: 'exception',
            time_ms: Date.now(),
            attributes: {
              'exception.message': str,
            },
          });
        }
      },
      end: (finalStatus) => {
        if (ended) {
          throw new Error(`Span "${name}" has already ended.`);
        }
        ended = true;
        if (finalStatus && (finalStatus === 'ERROR' || status !== 'ERROR')) {
          status = finalStatus;
        }

        const duration_ms = Math.round((performance.now() - startPerf) * 100) / 100;
        const record: SpanRecord = {
          type: 'span',
          name,
          trace_id: traceId,
          span_id: spanId,
          parent_id,
          start_time: startTime,
          duration_ms,
          status,
          error: errorDetail,
          attributes,
          events,
        };

        this.notifySpanEnd(record);
        return record;
      },
    };

    return spanScope;
  }

  public async startActiveSpan<T>(
    name: string,
    options: SpanOptions | undefined,
    fn: (span: ISpanScope) => Promise<T> | T,
  ): Promise<T> {
    const manualSpan = this.startManualSpan(name, options);

    return this.storage.run(manualSpan.context, async () => {
      const state: { status: 'OK' | 'ERROR' } = { status: 'OK' };
      const span: ISpanScope = {
        context: manualSpan.context,
        setStatus: (status) => {
          state.status = status;
          manualSpan.setStatus(status);
        },
        setAttributes: (attributes) => manualSpan.setAttributes(attributes),
        addEvent: (name, attributes) => manualSpan.addEvent(name, attributes),
        recordException: (error) => {
          state.status = 'ERROR';
          manualSpan.recordException(error);
        },
      };

      try {
        const result = await fn(span);
        if (options?.recordSuccess !== false || state.status === 'ERROR') {
          manualSpan.end(state.status);
        }
        return result;
      } catch (err) {
        manualSpan.recordException(err);
        manualSpan.end('ERROR');
        throw err;
      }
    });
  }
}

let tracerInstance: Tracer | null = null;

export function getTracer(): Tracer {
  if (!tracerInstance) {
    tracerInstance = new Tracer();
  }
  return tracerInstance;
}
