import { SoundOutlined } from '@ant-design/icons';
import type { WordTranslationResult } from '@app/shared/schemas/translate';
import { Button, Tag, Tooltip } from 'antd';
import type React from 'react';
import { useState } from 'react';

export interface CardWordResultProps {
  data: WordTranslationResult;
}

export const CardWordResult: React.FC<CardWordResultProps> = ({ data }) => {
  const [showAllSenses, setShowAllSenses] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<'us' | 'uk' | null>(null);

  const handleSpeak = (accent: 'us' | 'uk') => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    setPlayingVoice(accent);
    const utterance = new SpeechSynthesisUtterance(data.word);
    utterance.lang = accent === 'us' ? 'en-US' : 'en-GB';
    utterance.onend = () => setPlayingVoice(null);
    utterance.onerror = () => setPlayingVoice(null);
    window.speechSynthesis.speak(utterance);
  };

  const displayedSenses = showAllSenses ? data.senses : data.senses.slice(0, 3);
  const remainingCount = data.senses.length - 3;

  return (
    <div className="flex flex-col gap-3 px-3 py-2.5 text-sm select-text">
      {/* 1 & 2: 词头与音标 + 朗读按钮 */}
      <div className="flex items-baseline justify-between border-b border-border/60 pb-2">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <span className="text-2xl font-bold tracking-tight text-foreground">{data.word}</span>
          <div className="flex items-center gap-2 text-sm text-foreground-secondary">
            {data.phonetic_us && (
              <span className="flex items-center gap-1 font-mono">
                <span>美 /{data.phonetic_us}/</span>
                <Button
                  type="text"
                  size="small"
                  icon={<SoundOutlined className={playingVoice === 'us' ? 'text-primary' : ''} />}
                  onClick={() => handleSpeak('us')}
                  className="h-5 w-5 p-0"
                />
              </span>
            )}
            {data.phonetic_uk && (
              <span className="flex items-center gap-1 font-mono opacity-80">
                <span>英 /{data.phonetic_uk}/</span>
                <Button
                  type="text"
                  size="small"
                  icon={<SoundOutlined className={playingVoice === 'uk' ? 'text-primary' : ''} />}
                  onClick={() => handleSpeak('uk')}
                  className="h-5 w-5 p-0"
                />
              </span>
            )}
          </div>
        </div>
        <Tag className="m-0 text-xs text-foreground-muted border-0 bg-background-sunken">
          AI 生成
        </Tag>
      </div>

      {/* 3: 本句含义 (语境义，置顶) */}
      <div className="rounded-r-lg border-l-4 border-primary bg-primary-light p-2.5">
        <div className="text-xs font-semibold text-primary">▎本句含义</div>
        {data.context_sense ? (
          <div className="mt-1">
            <div className="text-base font-medium leading-relaxed text-foreground">
              {data.context_sense}
            </div>
            {data.context_snippet && (
              <div className="mt-1 text-xs text-foreground-secondary italic">
                原句：&ldquo;{data.context_snippet}&rdquo;
              </div>
            )}
          </div>
        ) : (
          <Tooltip title="未能读取所在上下文句子">
            <div className="mt-1 text-xs text-foreground-muted">
              未结合语境（未能获取上下文原句）
            </div>
          </Tooltip>
        )}
      </div>

      {/* 4: 全部义项 */}
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold text-foreground-secondary">全部义项</div>
        <div className="flex flex-col gap-2">
          {displayedSenses.map((sense, idx) => (
            <div
              key={`${sense.pos}-${idx}`}
              className="flex flex-col gap-0.5 text-xs rounded-md p-1.5 hover:bg-background-sunken transition-colors"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-primary min-w-[24px]">{sense.pos}</span>
                <span className="text-sm text-foreground">{sense.def}</span>
              </div>
              {sense.example && (
                <div className="mt-0.5 pl-8 text-xs text-foreground-secondary italic">
                  {sense.example}
                </div>
              )}
            </div>
          ))}
        </div>

        {data.senses.length > 3 && !showAllSenses && (
          <Button
            type="link"
            size="small"
            onClick={() => setShowAllSenses(true)}
            className="self-start p-0 text-xs text-primary"
          >
            展开剩余 {remainingCount} 条义项
          </Button>
        )}
      </div>
    </div>
  );
};
