import { Tooltip } from 'antd';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { memo, useEffect, useRef, useState } from 'react';

// 可抽离的逻辑处理函数/组件

/**
 * 单行省略 + 仅在实际被截断时悬停出 Tooltip。
 *
 * - 是否截断取决于容器宽度（窗口缩放、中英切换都会改变），用 ResizeObserver 实时判断，
 *   避免未截断的短文本也弹提示。
 * - 组件自带 `min-w-0`：作为 flex 子项时，默认 `min-width: auto` 会让元素撑到内容宽度，
 *   省略号实际由外层容器裁出、自身永远检测不到溢出。
 * - 多行截断（`line-clamp-*`）不在本组件职责内。
 */
const _EllipsisText = (props: EllipsisTextProps) => {
  // 变量声明、解构
  const { children, tooltip, className } = props;
  const textRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  // 组件Effect
  useEffect(() => {
    if (!tooltip) return;
    const element = textRef.current;
    if (!element) return;
    const check = () => setTruncated(element.scrollWidth > element.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children, tooltip]);

  // 组件渲染
  return (
    <Tooltip title={truncated && tooltip ? tooltip : undefined}>
      <span ref={textRef} className={clsx('min-w-0', className)}>
        {children}
      </span>
    </Tooltip>
  );
};

// props 类型定义
export interface EllipsisTextProps {
  children: ReactNode;
  /** 截断时展示的完整文本；非字符串内容不传，此时不弹 Tooltip */
  tooltip?: string;
  className?: string;
}

export const EllipsisText = memo(_EllipsisText);
