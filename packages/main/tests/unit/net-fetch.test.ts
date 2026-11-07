import { NetFetchTimeoutError, netFetch } from '@app/main/net/net-fetch';
import { net } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  net: {
    fetch: vi.fn(),
  },
}));

const fetchMock = net.fetch as unknown as ReturnType<typeof vi.fn>;

/** 模拟 net.fetch：挂起直到 signal 中止，并以 signal.reason 拒绝（与 Electron 行为一致） */
function abortableFetch(): void {
  fetchMock.mockImplementation(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          return;
        }
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
  );
}

describe('netFetch', () => {
  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
  });

  it('未传外部 signal 时也能正常发起请求并返回 Response（回归：单信号不得走 AbortSignal.any）', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));

    const response = await netFetch(new URL('https://example.test/ok'));

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/ok');
    // 默认 30s 超时应收敛为一个真实 AbortSignal
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('超时抛出 NetFetchTimeoutError', async () => {
    abortableFetch();

    await expect(netFetch('https://example.test/slow', { timeoutMs: 20 })).rejects.toBeInstanceOf(
      NetFetchTimeoutError,
    );
  });

  it('外部 AbortSignal 中止时透传 AbortError，不误报为超时', async () => {
    abortableFetch();
    const controller = new AbortController();

    const pending = netFetch('https://example.test/slow', {
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    setTimeout(() => controller.abort(), 10);

    await assertion;
  });

  it('timeoutMs <= 0 时不附加本封装超时信号', async () => {
    fetchMock.mockResolvedValue(new Response('ok'));

    await netFetch('https://example.test/ok', { timeoutMs: 0 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeNull();
  });

  it('HTTP 错误状态照常返回 Response，由调用方判定', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));

    const response = await netFetch('https://example.test/status');

    expect(response.status).toBe(500);
  });
});
