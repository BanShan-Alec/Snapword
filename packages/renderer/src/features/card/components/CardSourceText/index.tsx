import { CheckOutlined, CopyOutlined, SoundOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import type React from 'react';
import { useState } from 'react';

export interface CardSourceTextProps {
  text: string;
}

export const CardSourceText: React.FC<CardSourceTextProps> = ({ text }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  if (!text) return null;

  // 估算是否需要折叠展开按钮（超过 120 字符或换行）
  const lines = text.split('\n');
  const needsExpand = text.length > 120 || lines.length > 3;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleSpeak = () => {
    if (!('speechSynthesis' in window)) return;
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);
    setIsPlaying(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="mx-3 mt-2.5 rounded-lg border border-border bg-background-sunken p-2.5 text-xs text-foreground">
      <div
        className={`whitespace-pre-wrap font-sans leading-relaxed select-text ${
          !isExpanded && needsExpand ? 'line-clamp-3' : 'max-h-[300px] overflow-y-auto'
        }`}
      >
        {text}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-1.5 text-xs">
        <div className="flex items-center gap-1.5">
          <Tooltip title={isPlaying ? '停止朗读' : '朗读原文'}>
            <Button
              type="text"
              size="small"
              icon={<SoundOutlined className={isPlaying ? 'text-primary' : ''} />}
              onClick={handleSpeak}
              className="h-6 px-1.5 text-xs"
            >
              朗读
            </Button>
          </Tooltip>
          <Tooltip title={copied ? '已复制' : '复制原文'}>
            <Button
              type="text"
              size="small"
              icon={copied ? <CheckOutlined className="text-success" /> : <CopyOutlined />}
              onClick={handleCopy}
              className="h-6 px-1.5 text-xs"
            >
              {copied ? '已复制' : '复制'}
            </Button>
          </Tooltip>
        </div>

        {needsExpand && (
          <Button
            type="link"
            size="small"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 p-0 text-xs"
          >
            {isExpanded ? '折叠内容' : '显示全部'}
          </Button>
        )}
      </div>
    </div>
  );
};
