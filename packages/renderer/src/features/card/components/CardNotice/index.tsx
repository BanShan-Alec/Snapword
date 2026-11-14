import {
  CheckOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  InfoCircleOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import type React from 'react';
import { useState } from 'react';

export interface CardNoticeProps {
  notice: string | null;
  error: string | null;
  text?: string;
  onRetry?: () => void;
  onClose: () => void;
}

export const CardNotice: React.FC<CardNoticeProps> = ({
  notice,
  error,
  text,
  onRetry,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  const message = error || notice || '未获取到选中文本';
  const isError = Boolean(error);

  const handleCopyText = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-6 text-center select-none">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background-sunken">
        {isError ? (
          <CloseCircleOutlined className="text-xl text-danger" />
        ) : (
          <InfoCircleOutlined className="text-xl text-primary" />
        )}
      </div>

      <div className="flex flex-col gap-1 max-w-[320px]">
        <div className="text-sm font-medium text-foreground">{message}</div>
        {isError && (
          <div className="text-xs text-foreground-muted">
            请检查网络连接或接口配置，稍后点击重试。
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-2">
        {isError && onRetry && (
          <Button
            type="primary"
            size="small"
            icon={<RedoOutlined />}
            onClick={onRetry}
            className="text-xs"
          >
            重试
          </Button>
        )}

        {text && (
          <Button
            size="small"
            icon={copied ? <CheckOutlined className="text-success" /> : <CopyOutlined />}
            onClick={handleCopyText}
            className="text-xs"
          >
            {copied ? '已复制原文' : '复制原文'}
          </Button>
        )}

        <Button size="small" onClick={onClose} className="text-xs">
          关闭
        </Button>
      </div>
    </div>
  );
};
