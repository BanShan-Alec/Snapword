import { net } from 'electron';

/**
 * Electron net.fetch 封装（C07 拍板：跟随系统代理，不提供应用内代理设置）
 *
 * - 走 Chromium 网络栈（`net.fetch`），自动跟随系统代理；中转用户改 Base URL；
 *   应用内不提供任何代理设置入口（docs/architecture.md §5.2 / §15 ADR-lite「网络」行）。
 * - 翻译与 TTS 的所有 HTTP 请求统一走本函数（返回 Response），不再直接使用全局 fetch，
 *   保证超时、中止与代理行为一致。
 * - 超时用 AbortSignal.timeout 实现，与外部传入的 AbortSignal 合并监听；
 *   超时抛出 NetFetchTimeoutError，外部中止透传原始 AbortError，调用方可区分处理。
 * - 前置条件：app ready 之后才可调用（net 模块要求）。
 */

/** 默认超时：B-02 §8 超时矩阵「翻译请求 30s，0 自动重试」；TTS 沿用同值 */
export const DEFAULT_NET_FETCH_TIMEOUT_MS = 30_000;

/** 超时错误：与外部 AbortError 区分，供调用方映射「取词超时/翻译超时 + 重试」文案 */
export class NetFetchTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`net.fetch timeout after ${timeoutMs}ms: ${url}`);
    this.name = 'NetFetchTimeoutError';
  }
}

export interface NetFetchOptions extends RequestInit {
  /** 超时毫秒数；≤0 表示不启用本封装超时（外部 signal 仍生效）。默认 30s */
  timeoutMs?: number;
  /** 外部传入的中止信号（如用户取消、退出清理）；与本封装超时合并监听 */
  signal?: AbortSignal | null;
}

export async function netFetch(
  url: string | URL,
  options: NetFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_NET_FETCH_TIMEOUT_MS, signal: externalSignal, ...init } = options;

  const timeoutSignal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : null;
  // 注意：未传 signal 时 externalSignal 是 undefined，不能只过滤 null，
  // 否则单信号场景会退化成 AbortSignal.any([undefined, ...]) 并抛 TypeError。
  const signals = [externalSignal, timeoutSignal].filter(
    (s): s is AbortSignal => s !== null && s !== undefined,
  );
  const signal = signals.length > 1 ? AbortSignal.any(signals) : (signals[0] ?? null);

  try {
    // net.fetch 仅接受 string | Request；URL 归一为 string
    return await net.fetch(url.toString(), { ...init, signal });
  } catch (error) {
    if (timeoutSignal?.aborted && !externalSignal?.aborted) {
      throw new NetFetchTimeoutError(url.toString(), timeoutMs);
    }
    throw error;
  }
}
