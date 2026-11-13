import type { UpdaterProgress } from '@app/shared/types/updater';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Progress } from 'antd';
import type React from 'react';
import { AppCard } from '@/components/ui/AppCard';

interface ProgressCardProps {
  progress?: UpdaterProgress | null;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return '0 KB/s';
  if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  }
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
}

export const ProgressCard: React.FC<ProgressCardProps> = ({ progress }) => {
  useLingui();

  const percent = progress?.percent ? Math.min(100, Math.max(0, progress.percent)) : 0;
  const speedText = progress ? formatSpeed(progress.bytesPerSecond) : '0 KB/s';
  const transferredText = progress ? formatBytes(progress.transferred) : '0 MB';
  const totalText = progress ? formatBytes(progress.total) : '0 MB';

  return (
    <AppCard size="small" className="bg-background-elevated">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">{t`下载进度`}</span>
          <span className="font-mono text-foreground-secondary">
            {`${transferredText} / ${totalText}`}
          </span>
        </div>

        <Progress percent={percent} status="active" showInfo={false} />

        <div className="flex items-center justify-between text-xs text-foreground-secondary">
          <span>
            {t`传输速率`}: <span className="font-mono text-foreground-secondary">{speedText}</span>
          </span>
          <span className="font-mono font-medium">{`${percent}%`}</span>
        </div>
      </div>
    </AppCard>
  );
};
