import { Empty } from 'antd';
import type React from 'react';

/**
 * 空态占位页脚手架（C-05 主窗口外壳，RM-02 逐页占位的最小公共形态）。
 * 标题 + 可选说明 + 居中空态；页面文案本步允许先写中文（i18n 下一步统一接入）。
 */
export interface PagePlaceholderProps {
  /** 页面标题（RM-16 的页面名，标题栏接入后续做） */
  title: string;
  /** 标题下的一行说明 */
  description?: string;
  /** 空态主文案 */
  emptyText: string;
  /** 空态下的可选操作（如「去翻译」） */
  action?: React.ReactNode;
  /** 顶部说明条文案（RM-04 历史页的「仅保留本次运行」等硬性说明） */
  banner?: string;
}

export const PagePlaceholder: React.FC<PagePlaceholderProps> = ({
  title,
  description,
  emptyText,
  action,
  banner,
}) => (
  <section className="app-page flex h-full flex-col gap-4">
    <header>
      <h1 className="text-heading-sm font-semibold text-text">{title}</h1>
      {description ? <p className="mt-1 text-body text-text-secondary">{description}</p> : null}
    </header>
    {banner ? (
      <div className="rounded-sm border border-split bg-surface-1 px-3 py-2 text-caption text-text-secondary">
        {banner}
      </div>
    ) : null}
    <div className="flex flex-1 items-center justify-center rounded-md border border-split bg-surface-1">
      <Empty description={emptyText}>{action}</Empty>
    </div>
  </section>
);
