import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Badge, Tabs } from 'antd';
import { memo, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import logoCompact from '@/assets/logo-compact.svg?url';
import { EllipsisText } from '@/components/ui/EllipsisText';

// 可抽离的逻辑处理函数/组件
function resolveActiveTab(location: string): HeaderTab | undefined {
  if (location === '/settings') return 'settings';
  if (location === '/vocabulary') return 'vocabulary';
  if (location === '/history') return 'history';
  return 'translation';
}

const _Header = (props: HeaderProps) => {
  useLingui();
  const [location, navigate] = useLocation();

  // 变量声明、解构
  const activeTab = resolveActiveTab(location);
  const [vocabCount, setVocabCount] = useState<number>(0);

  // 监听生词本实时总数变更
  useEffect(() => {
    let mounted = true;
    window.api?.vocabulary
      ?.getCount()
      .then((res) => {
        if (mounted && res?.success && typeof res.data.count === 'number') {
          setVocabCount(res.data.count);
        }
      })
      .catch(() => {});

    const unbind = window.api?.vocabulary?.onChanged((payload) => {
      if (!mounted) return;
      if (
        payload &&
        typeof payload === 'object' &&
        'count' in payload &&
        typeof (payload as { count: number }).count === 'number'
      ) {
        setVocabCount((payload as { count: number }).count);
      } else {
        window.api?.vocabulary
          ?.getCount()
          .then((res) => {
            if (mounted && res?.success && typeof res.data.count === 'number') {
              setVocabCount(res.data.count);
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      mounted = false;
      unbind?.();
    };
  }, []);

  // 数据转换
  const appName = window.__APP_ENV__?.appName || 'Snapword';
  const tabItems = [
    { key: 'translation', label: t`翻译` },
    { key: 'history', label: t`翻译历史` },
    {
      key: 'vocabulary',
      label: (
        <span className="flex items-center gap-1.5">
          <span>{t`生词本`}</span>
          {vocabCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium">
              {vocabCount}
            </span>
          )}
        </span>
      ),
    },
    { key: 'settings', label: t`设置` },
  ];

  // 逻辑处理函数
  const handleTabChange = (key: string) => {
    const nextTab = key as HeaderTab;
    const targetPath =
      nextTab === 'settings'
        ? '/settings'
        : nextTab === 'vocabulary'
          ? '/vocabulary'
          : nextTab === 'history'
            ? '/history'
            : '/';
    navigate(targetPath);
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
export type HeaderTab = string;

export interface HeaderProps {
  onTabChange?: (tab: HeaderTab) => void;
}

export const Header = memo(_Header);
