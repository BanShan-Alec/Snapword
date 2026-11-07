import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Badge, Tabs } from 'antd';
import { memo } from 'react';
import { useLocation } from 'wouter';
import logoCompact from '@/assets/logo-compact.svg?url';
import { EllipsisText } from '@/components/ui/EllipsisText';

// 可抽离的逻辑处理函数/组件
function resolveActiveTab(location: string): HeaderTab {
  if (location.startsWith('/architecture')) return '/architecture';
  if (location.startsWith('/docs')) return '/docs';
  return '/dashboard';
}

const _Header = (props: HeaderProps) => {
  useLingui();
  const [location, navigate] = useLocation();

  // 变量声明、解构
  const activeTab = resolveActiveTab(location);

  // 组件状态

  // 网络IO

  // 数据转换
  const appName = window.__APP_ENV__?.appName || 'Electron App';
  const tabItems = [
    { key: '/dashboard', label: t`总览看板` },
    { key: '/architecture', label: t`架构全貌` },
    { key: '/docs', label: t`文档站` },
  ];

  // 逻辑处理函数
  const handleTabChange = (key: string) => {
    const nextTab = key as HeaderTab;
    navigate(nextTab);
    props.onTabChange?.(nextTab);
  };

  // 组件Effect

  // 组件渲染
  return (
    <header className="bg-background-container border-b border-border sticky top-0 z-30 select-none">
      {/* Layer 1: 系统标题栏（高度 32px，与原生 WCO 按钮/红绿灯同轴避让并独占窗口拖拽） */}
      <div className="drag-region h-8 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <img src={logoCompact} alt="" draggable={false} className="w-4 h-4 shrink-0" />
          <EllipsisText
            className="text-xs font-semibold text-foreground tracking-tight truncate"
            tooltip={appName}
          >
            {appName}
          </EllipsisText>
          <Badge
            count={window.__APP_ENV__?.appVersion || 'v0.0.0'}
            color="var(--color-primary)"
            className="shrink-0 scale-90 origin-left"
          />
        </div>
      </div>

      {/* Layer 2: 业务导航栏（非拖拽区，左侧 Tabs 标签页，右侧副标题描述） */}
      <div className="px-6 flex items-center justify-between gap-4 -mb-px">
        {/* 左侧：Tabs 页面切换 */}
        <div className="flex items-center min-w-0 flex-1">
          <Tabs
            activeKey={activeTab}
            items={tabItems}
            onChange={handleTabChange}
            tabBarStyle={{ marginBottom: 0 }}
            className="[&_.ant-tabs-nav]:mb-0 [&_.ant-tabs-nav::before]:border-b-0"
          />
        </div>

        {/* 右侧：副标题描述（窄窗隐藏，优先保证导航可用） */}
        <p className="hidden lg:block min-w-0 text-xs text-foreground-secondary leading-snug line-clamp-2 text-right">
          {t`企业级端到端类型安全桌面客户端脚手架`}
        </p>
      </div>
    </header>
  );
};

// props 类型定义
export type HeaderTab = '/dashboard' | '/architecture' | '/docs';

export interface HeaderProps {
  onTabChange?: (tab: HeaderTab) => void;
}

export const Header = memo(_Header);
