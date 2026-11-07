import { PROJECT_DOCS_URL } from '@shared/constants/docs';
import { useEffect, useRef, useState } from 'react';
import { callIpc } from '@/lib/ipc';
import type { DocsFrameStatus } from '../types';

const MIN_LOADING_MS = 300;
const LOAD_TIMEOUT_MS = 15_000;

/**
 * 文档站 iframe 的加载状态。
 *
 * 失败信号限制：跨源 iframe 的 load 事件在 Chromium 错误页上也会触发，
 * 渲染层无法区分成功/失败；A-lite 只做「最短展示 + 超时兜底」，
 * 网络失败时遮罩收起后会露出 Chromium 错误页（已知缺口）。
 */
export function useDocsFrame() {
  const [status, setStatus] = useState<DocsFrameStatus>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const loadStartedAtRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const readyTimerRef = useRef<number | null>(null);

  // ① 组件Effect：首次挂载与每次重试重置状态并启动 15s 超时
  useEffect(() => {
    loadStartedAtRef.current = Date.now();

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setStatus((current) => {
        if (current !== 'loading') return current;
        logger.warn('Docs frame load timed out');
        return 'timeout';
      });
    }, LOAD_TIMEOUT_MS);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (readyTimerRef.current !== null) {
        window.clearTimeout(readyTimerRef.current);
        readyTimerRef.current = null;
      }
    };
  }, [reloadKey]);

  // ② 逻辑处理函数
  const handleLoad = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // 整页重载会再次触发 onLoad；先清掉上一轮待执行的 ready 定时器
    if (readyTimerRef.current !== null) {
      window.clearTimeout(readyTimerRef.current);
      readyTimerRef.current = null;
    }

    const elapsedMs = Date.now() - loadStartedAtRef.current;
    const remainingMs = Math.max(0, MIN_LOADING_MS - elapsedMs);

    readyTimerRef.current = window.setTimeout(() => {
      readyTimerRef.current = null;
      setStatus('ready');
      logger.info('Docs frame loaded', { durationMs: Date.now() - loadStartedAtRef.current });
    }, remainingMs);
  };

  const handleRetry = () => {
    logger.info('Docs frame retry');
    setStatus('loading');
    setReloadKey((key) => key + 1);
  };

  const handleOpenExternal = () => {
    void callIpc('shell.openExternal', [PROJECT_DOCS_URL])
      .then(() => logger.info('Docs opened in external browser'))
      .catch(() => undefined);
  };

  return { status, reloadKey, handleLoad, handleRetry, handleOpenExternal };
}
