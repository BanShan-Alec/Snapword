import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { callIpc } from '../../src/lib/ipc';

let consoleInfo: MockInstance<typeof console.info>;

beforeEach(() => {
  vi.stubGlobal('window', {
    __APP_ENV__: { mode: 'test' },
  });
  vi.stubGlobal('logger', { error: vi.fn(), withTrace: vi.fn(() => ({ error: vi.fn() })) });
  consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  consoleInfo.mockRestore();
  vi.unstubAllGlobals();
});

describe('callIpc success logging options', () => {
  it('passes the quiet-success option to the service and skips dev success logs', async () => {
    const windowState = window as Window & { __APP_ENV__: { mode: string } };
    windowState.__APP_ENV__.mode = 'development';
    const result = { value: 42 };
    const service = vi.fn(async (options?: { recordSuccess?: boolean }) => {
      expect(options).toEqual({ recordSuccess: false });
      return { success: true as const, data: result };
    });

    await expect(callIpc('test.get', service, [], { recordSuccess: false })).resolves.toBe(result);
    expect(service).toHaveBeenCalledTimes(1);
    expect(consoleInfo).not.toHaveBeenCalled();
  });

  it('appends quiet-success options after the business arguments', async () => {
    const windowState = window as Window & { __APP_ENV__: { mode: string } };
    windowState.__APP_ENV__.mode = 'development';
    const service = vi.fn(async (id: string, options?: { recordSuccess?: boolean }) => {
      expect(options).toEqual({ recordSuccess: false });
      return { success: true as const, data: id };
    });

    await expect(callIpc('test.get', service, ['item'], { recordSuccess: false })).resolves.toBe(
      'item',
    );
    expect(service).toHaveBeenCalledWith('item', { recordSuccess: false });
    expect(consoleInfo).not.toHaveBeenCalled();
  });

  it('pads omitted optional business arguments so options stays in the options slot', async () => {
    const received: unknown[][] = [];
    const service = (input?: { step: number }, options?: { recordSuccess?: boolean }) => {
      received.push([input, options]);
      return Promise.resolve({ success: true as const, data: 7 });
    };
    // vi.fn 包装后 length 会变成 0，这里用真实函数才能覆盖 service.length 占位逻辑
    expect(service.length).toBe(2);

    await expect(callIpc('counter.increment', service, [], { recordSuccess: false })).resolves.toBe(
      7,
    );
    expect(received).toEqual([[undefined, { recordSuccess: false }]]);
  });

  it('keeps the service arguments unchanged when success logging is enabled', async () => {
    const windowState = window as Window & { __APP_ENV__: { mode: string } };
    windowState.__APP_ENV__.mode = 'development';
    const service = vi.fn(async (id: string) => ({ success: true as const, data: id }));

    await expect(callIpc('test.get', service, ['item'])).resolves.toBe('item');
    expect(service).toHaveBeenCalledWith('item');
    expect(consoleInfo).toHaveBeenCalledWith(expect.stringContaining('[ipc] test.get ok'));
  });

  it('still rejects failures when quiet-success logging is requested', async () => {
    const service = vi.fn(async () => ({
      success: false as const,
      error: 'not available',
      code: 'INTERNAL_ERROR',
    }));

    await expect(callIpc('test.get', service, [], { recordSuccess: false })).rejects.toThrow(
      'not available',
    );
  });
});
