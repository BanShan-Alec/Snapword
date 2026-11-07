import {
  AlertOutlined,
  BugOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Button } from 'antd';
import { memo } from 'react';
import { AppCard } from '@/components/ui/AppCard';
import { CardTitle } from '@/components/ui/CardTitle';
import { statusBoxClass } from '@/lib/classNames';

// 私有常量

// 可抽离的逻辑处理函数/组件

const _LoggingCard = (props: LoggingCardProps) => {
  useLingui();

  // 变量声明、解构
  const {
    logStatus,
    isLoading,
    isTriggeringSentry,
    onSendLog,
    onOpenLogFolder,
    onTriggerSentryError,
    onTriggerErrorBoundaryCrash,
  } = props;

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
          icon={<FileTextOutlined />}
          title={t`生产分级日志 (LogManager)`}
          subtitle={t`进程隔离落盘 (main.log / renderer-home.log) 与 5MB 自动轮转`}
        />
      }
      extra={
        <Button
          type="primary"
          size="small"
          icon={<FolderOpenOutlined />}
          loading={isLoading}
          onClick={onOpenLogFolder}
        >
          {t`打开日志目录`}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="small"
            icon={<InfoCircleOutlined className="text-primary" />}
            loading={isLoading}
            onClick={() => onSendLog('info')}
          >
            {t`发送 INFO`}
          </Button>
          <Button
            size="small"
            icon={<WarningOutlined className="text-warning" />}
            loading={isLoading}
            onClick={() => onSendLog('warn')}
          >
            {t`发送 WARN`}
          </Button>
          <Button
            size="small"
            icon={<CloseCircleOutlined className="text-danger" />}
            loading={isLoading}
            onClick={() => onSendLog('error')}
          >
            {t`发送 ERROR`}
          </Button>
          <Button
            size="small"
            icon={<BugOutlined className="text-danger" />}
            loading={isTriggeringSentry}
            onClick={onTriggerSentryError}
          >
            {t`触发 Sentry 异常`}
          </Button>
          <Button
            size="small"
            icon={<AlertOutlined className="text-danger" />}
            onClick={onTriggerErrorBoundaryCrash}
          >
            {t`触发 ErrorBoundary 崩溃`}
          </Button>
        </div>

        {logStatus && <div className={statusBoxClass({ breakAll: true })}>{logStatus}</div>}
      </div>
    </AppCard>
  );
};

// props 类型定义
interface LoggingCardProps {
  logStatus: string;
  isLoading: boolean;
  isTriggeringSentry?: boolean;
  onSendLog: (level: 'info' | 'warn' | 'error') => void;
  onOpenLogFolder: () => void;
  onTriggerSentryError?: () => void;
  onTriggerErrorBoundaryCrash?: () => void;
}

export const LoggingCard = memo(_LoggingCard);
