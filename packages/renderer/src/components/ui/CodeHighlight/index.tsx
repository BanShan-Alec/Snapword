import { memo, useRef } from 'react';
import { useCodeHighlight } from './hooks/useCodeHighlight';
import './highlight.css';

// 私有常量

// 可抽离的逻辑处理函数/组件

const _CodeHighlight = (props: CodeHighlightProps) => {
  // 变量声明、解构
  const { code, className, as: Component = 'pre' } = props;
  const containerRef = useRef<HTMLPreElement>(null);

  // 组件Effect
  useCodeHighlight(containerRef, code);

  // 组件渲染
  return (
    <Component ref={containerRef} className={className}>
      {code}
    </Component>
  );
};

// props 类型定义
export interface CodeHighlightProps {
  code: string;
  className?: string;
  as?: 'pre' | 'code';
}

export const CodeHighlight = memo(_CodeHighlight);
export { useCodeHighlight };
