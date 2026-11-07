import { ApiOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Button } from 'antd';
import { memo } from 'react';
import { AppCard } from '@/components/ui/AppCard';
import { CardTitle } from '@/components/ui/CardTitle';
import { StatusTag } from '@/components/ui/StatusTag';

// 私有常量
const FAST_LATENCY_MS = 5;
const NORMAL_LATENCY_MS = 15;

// 可抽离的逻辑处理函数/组件
function LatencyTag({ latency }: { latency: number }) {
  // 订阅语言上下文：渲染在组件内完成，避免模块级函数被 React Compiler 按 latency 缓存
  useLingui();
  if (latency < FAST_LATENCY_MS) {
    return <StatusTag tone="success">{t`极速`}</StatusTag>;
  }
  if (latency < NORMAL_LATENCY_MS) {
    return <StatusTag tone="info">{t`正常`}</StatusTag>;
  }
  return <StatusTag tone="warning">{t`延迟稍高`}</StatusTag>;
}

const _PingCard = (props: PingCardProps) => {
  useLingui();
  // 变量声明、解构
  const { latency, serverTime, isPinging, onPing } = props;

  // 组件状态

  // 网络IO

  // 数据转换

  // 逻辑处理函数

  // 组件Effect

  // 组件渲染
  return (
    <AppCard
      title={
        <CardTitle
          icon={<ApiOutlined />}
          title={t`进程间通信 (IPC Ping)`}
          subtitle={t`Electron ContextBridge & window.api 延迟测量`}
        />
      }
    >
      <div className="flex flex-1 flex-col sm:flex-row items-stretch justify-between gap-4 p-4 bg-background-sunken rounded-lg border border-border">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="flex flex-col">
            <span className="text-xs text-foreground-secondary font-medium">
              {t`IPC 通信往返延迟`}
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-semibold text-foreground font-mono">
                {latency !== null ? `${latency}` : '--'}
              </span>
              <span className="text-xs text-foreground-secondary font-mono">ms</span>
              {latency !== null && <LatencyTag latency={latency} />}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 gap-y-2 w-full sm:w-auto justify-between sm:justify-end">
          {serverTime && (
            <span className="text-xs text-foreground-secondary font-mono">
              {t`主进程时间`}: {serverTime}
            </span>
          )}
          <Button
            type="primary"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={isPinging}
            onClick={onPing}
          >
            {t`测速 Ping`}
          </Button>
        </div>
      </div>
    </AppCard>
  );
};

// props 类型定义
interface PingCardProps {
  latency: number | null;
  serverTime: string;
  isPinging: boolean;
  onPing: () => void;
}

export const PingCard = memo(_PingCard);
