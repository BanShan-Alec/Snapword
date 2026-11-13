import { Tag } from 'antd';
import type { ReactNode } from 'react';
import { memo } from 'react';

// 私有常量
type StatusTone = 'success' | 'warning' | 'danger' | 'info';

const TONE_DOT_CLASS: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-primary',
};

// 可抽离的逻辑处理函数/组件

const _StatusTag = (props: StatusTagProps) => {
  // 变量声明、解构
  const { tone, children } = props;

  // 组件渲染
  return (
    <Tag className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`inline-block size-1.5 rounded-full ${TONE_DOT_CLASS[tone]}`}
      />
      {children}
    </Tag>
  );
};

// props 类型定义
export interface StatusTagProps {
  tone: StatusTone;
  children: ReactNode;
}

export const StatusTag = memo(_StatusTag);
