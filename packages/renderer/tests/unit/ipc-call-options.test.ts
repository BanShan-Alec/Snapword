import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { callIpc } from '../../src/lib/ipc';

let consoleInfo: MockInstance<typeof console.info>;

beforeEach(() => {
  vi.stubGlobal('window', {
    __APP_ENV__: { mode: 'test' },
    api: {},
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
    const windowState = window as Window & { __APP_ENV__: { mode: string }; api: any };
    windowState.__APP_ENV__.mode = 'development';
    const result = {
      platform: 'win32',
      arch: 'x64',
      cpus: [],
      totalMemory: 100,
      freeMemory: 50,
    };
    const service = vi.fn(async (options?: { recordSuccess?: boolean }) => {
      expect(options).toEqual({ recordSuccess: false });
      return { success: true as const, data: result };
    });
    windowState.api = {
      system: {
        getSystemInfo: service,
      },
    };

    await expect(
      callIpc('system.getSystemInfo', undefined, { recordSuccess: false }),
    ).resolves.toBe(result);
    expect(service).toHaveBeenCalledTimes(1);
    expect(consoleInfo).not.toHaveBeenCalled();
  });

  it('appends quiet-success options after the business arguments', async () => {
    const windowState = window as Window & { __APP_ENV__: { mode: string }; api: any };
    windowState.__APP_ENV__.mode = 'development';
    const service = vi.fn(async (_locale: string, options?: { recordSuccess?: boolean }) => {
      expect(options).toEqual({ recordSuccess: false });
      return { success: true as const, data: { success: true } };
    });
    windowState.api = {
      system: {
        setLocale: service,
      },
    };

    await expect(callIpc('system.setLocale', ['zh-CN'], { recordSuccess: false })).resolves.toEqual(
      { success: true },
    );
    expect(service).toHaveBeenCalledWith('zh-CN', { recordSuccess: false });
    expect(consoleInfo).not.toHaveBeenCalled();
  });

  it('pads omitted optional business arguments so options stays in the options slot', async () => {
    const windowState = window as Window & { __APP_ENV__: { mode: string }; api: any };
    const received: unknown[][] = [];
    const service = (locale?: string, options?: { recordSuccess?: boolean }) => {
      received.push([locale, options]);
      return Promise.resolve({ success: true as const, data: { success: true } });
    };
    // vi.fn 包装后 length 会变成 0，这里用真实函数才能覆盖 service.length 占位逻辑
    expect(service.length).toBe(2);
    windowState.api = {
      system: {
        setLocale: service,
      },
    };

    await expect(callIpc('system.setLocale', undefined, { recordSuccess: false })).resolves.toEqual(
      { success: true },
    );
    expect(received).toEqual([[undefined, { recordSuccess: false }]]);
  });

  it('pads omitted optional business arguments even when service.length is 0 (contextBridge simulation)', async () => {
    const windowState = window as Window & { __APP_ENV__: { mode: string }; api: any };
    const received: unknown[][] = [];
    // 模拟 contextBridge 暴露的原生包装函数（length 为 0）
    const service = vi.fn((...args: [locale?: string, options?: { recordSuccess?: boolean }]) => {
      received.push(args);
      return Promise.resolve({ success: true as const, data: { success: true } });
    });
    expect(service.length).toBe(0);

    windowState.api = {
      system: {
        setLocale: service,
      },
    };

    await expect(callIpc('system.setLocale', undefined, { recordSuccess: false })).resolves.toEqual(
      { success: true },
    );
    expect(received).toEqual([[undefined, { recordSuccess: false }]]);
  });

  it('throws an error when IPC API path format is invalid', async () => {
    await expect(callIpc('invalidPath' as any)).rejects.toThrow(
      '[callIpc] Invalid IPC API path format: "invalidPath". Expected "domain.method"',
    );
    await expect(callIpc('a.b.c' as any)).rejects.toThrow(
      '[callIpc] Invalid IPC API path format: "a.b.c". Expected "domain.method"',
    );
  });

  it('keeps the service arguments unchanged when success logging is enabled', async () => {
    const windowState = window as Window & { __APP_ENV__: { mode: string }; api: any };
    windowState.__APP_ENV__.mode = 'development';
    const service = vi.fn(async (_locale: string) => ({
      success: true as const,
      data: { success: true },
    }));
    windowState.api = {
      system: {
        setLocale: service,
      },
    };

    await expect(callIpc('system.setLocale', ['zh-CN'])).resolves.toEqual({ success: true });
    expect(service).toHaveBeenCalledWith('zh-CN');
    expect(consoleInfo).toHaveBeenCalledWith(expect.stringContaining('[ipc] system.setLocale ok'));
  });

  it('still rejects failures when quiet-success logging is requested', async () => {
    const windowState = window as Window & { __APP_ENV__: { mode: string }; api: any };
    const service = vi.fn(async () => ({
      success: false as const,
      error: 'not available',
      code: 'INTERNAL_ERROR',
    }));
    windowState.api = {
      system: {
        getSystemInfo: service,
      },
    };

    await expect(
      callIpc('system.getSystemInfo', undefined, { recordSuccess: false }),
    ).rejects.toThrow('not available');
  });

  it('throws an error when IPC API method is not found on window.api', async () => {
    const windowState = window as Window & { api: any };
    windowState.api = {};

    await expect(callIpc('system.getSystemInfo')).rejects.toThrow(
      '[callIpc] Unknown IPC API method for path: "system.getSystemInfo"',
    );
  });
});
