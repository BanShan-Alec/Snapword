import type { ReactNode } from 'react';
import { memo } from 'react';
import { EllipsisText } from '@/components/ui/EllipsisText';

// 可抽离的逻辑处理函数/组件

const TITLE_CLASS = 'text-base font-semibold text-foreground tracking-tight truncate leading-tight';
const SUBTITLE_CLASS = 'text-xs text-foreground-secondary mt-0.5 font-normal truncate';

const _CardTitle = (props: CardTitleProps) => {
  // 变量声明、解构
  const { icon, title, subtitle } = props;

  // 组件状态

  // 网络IO

  // 数据转换

  // 逻辑处理函数

  // 组件Effect

  // 组件渲染
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {icon && (
        <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 text-base">
          {icon}
        </div>
      )}
      <div className="flex flex-col min-w-0">
        <EllipsisText
          className={TITLE_CLASS}
          tooltip={typeof title === 'string' ? title : undefined}
        >
          {title}
        </EllipsisText>
        {subtitle && (
          <EllipsisText
            className={SUBTITLE_CLASS}
            tooltip={typeof subtitle === 'string' ? subtitle : undefined}
          >
            {subtitle}
          </EllipsisText>
        )}
      </div>
    </div>
  );
};

// props 类型定义
export interface CardTitleProps {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
}

export const CardTitle = memo(_CardTitle);
