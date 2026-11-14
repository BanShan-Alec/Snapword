import { DeleteOutlined, ReadOutlined, SoundOutlined } from '@ant-design/icons';
import type { VocabularyRecordDto } from '@app/shared/schemas/vocabulary';
import { Button, Empty, Popconfirm, Spin, Tag, Tooltip } from 'antd';
import type React from 'react';

export interface VocabularyListProps {
  words: VocabularyRecordDto[];
  loading: boolean;
  onDeleteWord: (record: VocabularyRecordDto) => void;
}

export const VocabularyList: React.FC<VocabularyListProps> = ({ words, loading, onDeleteWord }) => {
  const handleSpeak = (text: string) => {
    if (!text || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  if (loading && words.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (words.length === 0) {
    return (
      <div className="py-16 text-center">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div className="flex flex-col gap-1 text-sm text-foreground-secondary">
              <span className="font-medium text-foreground">还没有收藏的单词</span>
              <span>在翻译卡片或划词面板中点击 ☆ 即可收藏至生词本</span>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border/60">
      {words.map((item) => {
        const phonetic = item.phoneticUs
          ? `/${item.phoneticUs}/`
          : item.phoneticUk
            ? `/${item.phoneticUk}/`
            : '';

        const createdDate = item.createdAt
          ? new Date(item.createdAt).toLocaleString(undefined, {
              dateStyle: 'short',
              timeStyle: 'short',
            })
          : '';

        return (
          <div
            key={item.id}
            className="flex flex-col gap-2 py-4 px-2 hover:bg-background-elevated/40 rounded-xl transition-colors"
          >
            {/* Header: 单词、音标、朗读、标签、收藏时间、删除 */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-semibold text-lg text-foreground tracking-tight">
                  {item.word}
                </span>

                {phonetic && (
                  <span className="text-xs text-foreground-secondary font-mono">{phonetic}</span>
                )}

                <Tooltip title="发音">
                  <Button
                    type="text"
                    size="small"
                    icon={<SoundOutlined />}
                    onClick={() => handleSpeak(item.word)}
                    className="h-6 w-6 p-0 text-foreground-secondary hover:text-primary"
                  />
                </Tooltip>

                {item.tags.map((t) => (
                  <Tag key={t} color="blue" className="text-xs">
                    {t}
                  </Tag>
                ))}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-foreground-secondary">{createdDate}</span>

                <Popconfirm
                  title="确认删除该生词？"
                  description="删除后 5 秒内可在屏幕底部撤销"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => onDeleteWord(item)}
                >
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    className="h-7 w-7 p-0"
                  />
                </Popconfirm>
              </div>
            </div>

            {/* 语境释义 */}
            {item.contextSense && (
              <div className="flex items-baseline gap-2 text-sm">
                <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  语境义
                </span>
                <span className="font-medium text-foreground">{item.contextSense}</span>
              </div>
            )}

            {/* 释义列表 */}
            {item.senses && item.senses.length > 0 && (
              <div className="flex flex-col gap-1 pl-1">
                {item.senses.map((sense, idx) => (
                  <div key={idx} className="text-xs text-foreground-secondary leading-relaxed">
                    <span className="font-semibold text-foreground/80 mr-1.5 italic">
                      {sense.pos}
                    </span>
                    <span>{sense.def}</span>
                    {sense.example && (
                      <span className="ml-2 text-foreground-secondary/70 italic">
                        "{sense.example}"
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 原句片段 */}
            {item.contextSnippet && (
              <div className="flex items-start gap-1.5 mt-1 p-2 rounded-lg bg-background-elevated/80 text-xs text-foreground-secondary border border-border/50">
                <ReadOutlined className="mt-0.5 shrink-0 text-primary" />
                <span className="italic line-clamp-2">"{item.contextSnippet}"</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
