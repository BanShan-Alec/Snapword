import type React from 'react';
import { useEffect, useRef } from 'react';
import { CardBottomBar } from './components/CardBottomBar';
import { CardHeader } from './components/CardHeader';
import { CardNotice } from './components/CardNotice';
import { CardSentenceResult } from './components/CardSentenceResult';
import { CardSkeleton } from './components/CardSkeleton';
import { CardSourceText } from './components/CardSourceText';
import { CardWordResult } from './components/CardWordResult';
import { useCardTranslation } from './hooks/useCardTranslation';

export const CardFeature: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    action,
    notice,
    text,
    mode,
    isLoading,
    isSlow,
    streamingText,
    wordResult,
    sentenceResult,
    error,
    isStopped,
    isPinned,
    isFavorite,
    stopTranslation,
    retry,
    togglePin,
    hideCard,
    openInHome,
    toggleFavorite,
    saveFavorite,
  } = useCardTranslation();

  // 视口与卡片内容高度自适应反馈 (RC-03)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      const scrollHeight = Math.ceil(el.scrollHeight);
      window.api?.card?.resize(scrollHeight);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 组装剪贴板复制内容
  const getContentToCopy = (): string => {
    if (mode === 'word' && wordResult) {
      const senses = wordResult.senses
        .map((s) => `${s.pos} ${s.def}${s.example ? ` (${s.example})` : ''}`)
        .join('\n');
      return `${wordResult.word}\n${wordResult.phonetic_us ? `美 /${wordResult.phonetic_us}/\n` : ''}${
        wordResult.context_sense ? `本句含义：${wordResult.context_sense}\n` : ''
      }${senses}`;
    }
    return sentenceResult?.text || streamingText;
  };

  const showSkeleton = isLoading && !streamingText && !wordResult;
  const isNoticeOrError = (action === 'notice' && !wordResult && !streamingText) || Boolean(error);

  return (
    <div
      ref={containerRef}
      className="flex w-[420px] max-w-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-background-container text-foreground shadow-xl transition-all duration-150"
    >
      <CardHeader
        mode={mode}
        isPinned={isPinned}
        onTogglePin={togglePin}
        onClose={hideCard}
        onOpenInHome={openInHome}
      />

      <div className="flex max-h-[70vh] flex-col overflow-y-auto">
        {/* 原文卡（仅在有输入文本且非纯空状态展示） */}
        {text && !isNoticeOrError && <CardSourceText text={text} />}

        {/* 状态展示与结果区 */}
        {isNoticeOrError ? (
          <CardNotice
            notice={notice}
            error={error}
            text={text}
            onRetry={retry}
            onClose={hideCard}
          />
        ) : showSkeleton ? (
          <CardSkeleton mode={mode} isSlow={isSlow} />
        ) : mode === 'word' && wordResult ? (
          <CardWordResult data={wordResult} />
        ) : (
          <CardSentenceResult
            streamingText={streamingText}
            result={sentenceResult}
            isLoading={isLoading}
            isStopped={isStopped}
          />
        )}
      </div>

      {/* 底部固定操作栏（仅在正常翻译状态展示） */}
      {!isNoticeOrError && (
        <CardBottomBar
          mode={mode}
          contentToCopy={getContentToCopy()}
          isLoading={isLoading}
          isStopped={isStopped}
          isFavorite={isFavorite}
          onStop={stopTranslation}
          onRetry={retry}
          onToggleFavorite={toggleFavorite}
          onUpdateFavorite={saveFavorite}
        />
      )}
    </div>
  );
};
