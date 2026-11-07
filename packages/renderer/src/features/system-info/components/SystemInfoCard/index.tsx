import { DesktopOutlined } from '@ant-design/icons';
import { plural, t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import type { SystemInfo } from '@shared/types/system';
import { Skeleton } from 'antd';
import { memo } from 'react';
import { AppCard } from '@/components/ui/AppCard';
import { CardTitle } from '@/components/ui/CardTitle';

// 私有常量
const INFO_GRID_CLASS = 'grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs';
const INFO_CELL_CLASS = 'bg-background-sunken p-2.5 rounded-lg border border-border/60 select-text';

// 可抽离的逻辑处理函数/组件
function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className={INFO_CELL_CLASS}>
      <span className="text-foreground-secondary block text-xs">{label}</span>
      <span className="font-semibold text-foreground mt-0.5 block font-mono break-words">
        {value}
      </span>
    </div>
  );
}

const _SystemInfoCard = (props: SystemInfoCardProps) => {
  useLingui();
  // 变量声明、解构
  const { systemInfo, isLoading } = props;

  // 组件状态

  // 网络IO

  // 数据转换
  const showSkeleton = isLoading && systemInfo === null;
  const cpuCores = systemInfo?.cpuCores ?? 0;
  const cpuModel = systemInfo?.cpuModel ?? '';
  const uptimeMinutes = systemInfo ? Math.floor(systemInfo.uptimeSeconds / 60) : 0;
  const uptimeSeconds = systemInfo?.uptimeSeconds ?? 0;

  // 逻辑处理函数

  // 组件Effect

  // 组件渲染
  return (
    <AppCard
      title={
        <CardTitle
          icon={<DesktopOutlined />}
          title={t`系统与运行环境`}
          subtitle={t`Electron & Node.js 原生底层探针`}
        />
      }
    >
      {showSkeleton ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : systemInfo ? (
        <div className={INFO_GRID_CLASS}>
          <InfoCell label={t`平台架构`} value={`${systemInfo.platform} (${systemInfo.arch})`} />
          <InfoCell label={t`Electron 版本`} value={`v${systemInfo.electronVersion}`} />
          <InfoCell label={t`Node.js 版本`} value={`v${systemInfo.nodeVersion}`} />
          <InfoCell label={t`Chromium 版本`} value={`v${systemInfo.chromeVersion}`} />
          <InfoCell
            label={t`CPU 核心 / 架构`}
            value={t`${plural(cpuCores, { one: '# 核', other: '# 核' })} (${cpuModel})`}
          />
          <InfoCell
            label={t`可用内存 / 总内存`}
            value={`${systemInfo.freeMemoryMB} MB / ${systemInfo.totalMemoryMB} MB`}
          />
          <InfoCell
            label={t`主进程堆内存占用`}
            value={`${systemInfo.heapUsedMB} MB / ${systemInfo.heapTotalMB} MB`}
          />
          <InfoCell
            label={t`系统运行时间`}
            value={t`${plural(uptimeMinutes, { one: '# 分钟', other: '# 分钟' })} (${plural(uptimeSeconds, { one: '# 秒', other: '# 秒' })})`}
          />
          <InfoCell label={t`V8 引擎版本`} value={`v${systemInfo.v8Version}`} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-6 text-foreground-secondary text-xs">
          {t`正在探测系统运行环境...`}
        </div>
      )}
    </AppCard>
  );
};

// props 类型定义
interface SystemInfoCardProps {
  systemInfo: SystemInfo | null;
  isLoading: boolean;
}

export const SystemInfoCard = memo(_SystemInfoCard);
