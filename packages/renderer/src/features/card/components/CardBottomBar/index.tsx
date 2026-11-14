import {
  CheckOutlined,
  CopyOutlined,
  PauseCircleOutlined,
  RedoOutlined,
  SoundOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import { Button, Popover, Tooltip } from 'antd';
import type React from 'react';
import { useState } from 'react';

export interface CardBottomBarProps {
  mode: 'word' | 'sentence';
  contentToCopy: string;
  isLoading: boolean;
  isStopped: boolean;
  isFavorite: boolean;
  onStop: () => void;
  onRetry: () => void;
  onToggleFavorite: () => void;
  onUpdateFavorite?: () => void;
}

export const CardBottomBar: React.FC<CardBottomBarProps> = ({
  mode,
  contentToCopy,
  isLoading,
  isStopped,
  isFavorite,
  onStop,
  onRetry,
  onToggleFavorite,
  onUpdateFavorite,
}) => {
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duplicatePromptOpen, setDuplicatePromptOpen] = useState(false);

  const handleCopy = async () => {
    if (!contentToCopy) return;
    try {
      if (window.api?.card?.copyText) {
        await window.api.card.copyText(contentToCopy);
      } else {
        await navigator.clipboard.writeText(contentToCopy);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      try {
        await navigator.clipboard.writeText(contentToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // ignore
      }
    }
  };

  const handleSpeak = () => {
    if (!contentToCopy || !('speechSynthesis' in window)) return;
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(contentToCopy);
    utterance.lang = 'zh-CN';
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);
    setIsPlaying(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <footer className="sticky bottom-0 flex h-11 w-full items-center justify-between border-t border-border bg-background-elevated/90 px-3 backdrop-blur-xs select-none">
      {/* 左侧控制按钮：流式中显示停止，已停止显示重试 */}
      <div className="flex items-center">
        {isLoading && (
          <Button
            type="text"
            size="small"
            danger
            icon={<PauseCircleOutlined />}
            onClick={onStop}
            className="h-7 text-xs font-medium"
          >
            停止
          </Button>
        )}
        {isStopped && (
          <Button
            type="text"
            size="small"
            icon={<RedoOutlined />}
            onClick={onRetry}
            className="h-7 text-xs font-medium text-primary"
          >
            已停止 · 重试
          </Button>
        )}
      </div>

      {/* 右侧常规操作：复制、朗读、收藏（仅单词） */}
      <div className="flex items-center gap-1.5 ml-auto">
        <Tooltip title={copied ? '已复制' : mode === 'word' ? '点击复制' : '点击复制译文'}>
          <Button
            type="text"
            size="small"
            icon={copied ? <CheckOutlined className="text-success" /> : <CopyOutlined />}
            onClick={handleCopy}
            className="h-7 px-2 text-xs"
          >
            {copied ? '已复制' : mode === 'word' ? '点击复制' : '复制译文'}
          </Button>
        </Tooltip>

        <Tooltip title={isPlaying ? '停止朗读' : '朗读译文'}>
          <Button
            type="text"
            size="small"
            icon={<SoundOutlined className={isPlaying ? 'text-primary' : ''} />}
            onClick={handleSpeak}
            className="h-7 w-7 p-0"
          />
        </Tooltip>

        {mode === 'word' &&
          (isFavorite ? (
            <Popover
              open={duplicatePromptOpen}
              onOpenChange={setDuplicatePromptOpen}
              trigger="click"
              placement="topRight"
              content={
                <div className="flex flex-col gap-2 p-1 text-xs select-none">
                  <div className="font-medium text-foreground">已收藏 · 更新 / 取消</div>
                  <div className="text-foreground-secondary">是否使用当前语境片段更新该词条？</div>
                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <Button
                      size="small"
                      onClick={() => setDuplicatePromptOpen(false)}
                      className="h-6 text-xs"
                    >
                      取消
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => {
                        setDuplicatePromptOpen(false);
                        onUpdateFavorite?.();
                      }}
                      className="h-6 text-xs"
                    >
                      更新
                    </Button>
                  </div>
                </div>
              }
            >
              <Tooltip title={duplicatePromptOpen ? undefined : '已在生词本'}>
                <Button
                  type="text"
                  size="small"
                  icon={<StarFilled className="text-warning" />}
                  className="h-7 w-7 p-0"
                />
              </Tooltip>
            </Popover>
          ) : (
            <Tooltip title="加入生词本">
              <Button
                type="text"
                size="small"
                icon={<StarOutlined />}
                onClick={onToggleFavorite}
                className="h-7 w-7 p-0"
              />
            </Tooltip>
          ))}
      </div>
    </footer>
  );
};
