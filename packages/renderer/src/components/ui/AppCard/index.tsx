import type { CardProps } from 'antd';
import { Card } from 'antd';
import { clsx } from 'clsx';
import { memo } from 'react';

// 私有常量

// 可抽离的逻辑处理函数/组件

const _AppCard = (props: AppCardProps) => {
  // 变量声明、解构
  const { className, ...rest } = props;

  // 组件渲染
  return (
    <Card
      {...rest}
      className={clsx('app-card app-card-hover flex flex-col', className)}
      classNames={{ body: 'flex flex-1 flex-col', extra: 'ps-3' }}
    />
  );
};

// props 类型定义
export interface AppCardProps extends Omit<CardProps, 'classNames' | 'styles'> {}

export const AppCard = memo(_AppCard);
