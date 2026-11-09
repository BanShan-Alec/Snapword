import { Badge } from 'antd';
import { memo } from 'react';
import logoCompact from '@/assets/logo-compact.svg?url';
import { EllipsisText } from '@/components/ui/EllipsisText';

/**
 * 系统标题栏（无边框窗口 + WCO 架构）：
 * - 32px 拖拽层独占窗口拖拽，与原生 WCO 按钮/红绿灯同轴避让（避让规则见 base.css）；
 * - 业务导航由 AppShell 侧栏承接（RM-02），本层不再放 Tabs。
 */
const _Header = () => {
  // 数据转换
  const appName = window.__APP_ENV__?.appName || 'Electron App';

  // 组件渲染
  return (
    <header className="bg-background-container border-b border-border sticky top-0 z-30 select-none">
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
    </header>
  );
};

export const Header = memo(_Header);
