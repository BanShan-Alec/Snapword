import type { RefObject } from 'react';
import { useLayoutEffect, useRef } from 'react';
import {
  createRangesFromTokens,
  type HighlightTokenType,
  highlightManager,
  tokenizeCode,
} from '../lib/codeHighlight';

// 可抽离的逻辑处理函数/组件

/**
 * 将代码高亮 Range 注册到 CSS Custom Highlight API 的通用 Hook
 */
export function useCodeHighlight(containerRef: RefObject<HTMLElement | null>, code: string): void {
  const tokens = tokenizeCode(code);
  const rangesRef = useRef<Map<HighlightTokenType, Range[]>>(new Map());

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    // 计算当前 DOM Text 节点的 Ranges
    const ranges = createRangesFromTokens(el, tokens);
    rangesRef.current = ranges;

    // 向全局 highlightManager 注册当前实例的 Range 提供者
    const unregister = highlightManager.register(() => rangesRef.current);

    return () => {
      rangesRef.current = new Map();
      unregister();
    };
  }, [containerRef, tokens]);
}
