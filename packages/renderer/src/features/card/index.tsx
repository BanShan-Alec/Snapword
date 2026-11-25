import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { CardBottomBar } from './components/CardBottomBar';
import { CardHeader } from './components/CardHeader';
import { CardNotice } from './components/CardNotice';
import { CardSentenceResult } from './components/CardSentenceResult';
import { CardSkeleton } from './components/CardSkeleton';
import { CardSourceText } from './components/CardSourceText';
import { CardWordResult } from './components/CardWordResult';
import { useCardTranslation } from './hooks/useCardTranslation';

function shouldShowBottomFade(el: HTMLElement): boolean {
  return (
    el.scrollHeight > el.clientHeight + 2 && el.scrollTop + el.clientHeight < el.scrollHeight - 2
  );
}

export const CardFeature: React.FC = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const [showBottomFade, setShowBottomFade] = useState(false);

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

  // 监测固定视口内容溢出状态，控制底部渐变淡出遮罩显隐
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const update = () => {
      setShowBottomFade(shouldShowBottomFade(el));
    };
    update();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (scrollContentRef.current) {
      observer.observe(scrollContentRef.current);
    }
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

  const showSkeleton = (isLoading || action === 'idle') && !streamingText && !wordResult;
  const isNoticeOrError = (action === 'notice' && !wordResult && !streamingText) || Boolean(error);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background-container text-foreground select-none transition-colors duration-150">
      <CardHeader
        mode={mode}
        isPinned={isPinned}
        onTogglePin={togglePin}
        onClose={hideCard}
        onOpenInHome={openInHome}
      />

      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollContainerRef}
          onScroll={(event) => setShowBottomFade(shouldShowBottomFade(event.currentTarget))}
          className="h-full overflow-y-auto"
        >
          <div ref={scrollContentRef} className="flex min-h-full flex-col">
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
        </div>

        {/* 底部渐变淡出遮罩，提示下方仍有未展示内容 */}
        <div
          aria-hidden="true"
          className={`usb-scroll-fade usb-scroll-fade-bottom ${
            showBottomFade ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>

      {/* 底部固定操作栏（仅在正常翻译状态展示） */}
      {!isNoticeOrError && (
        <CardBottomBar
          mode={mode}
          contentToCopy={getContentToCopy()}
          isLoading={isLoading}
          isStopped={isStopped}
          isFavorite={isFavorite}
          isOverflowing={showBottomFade}
          onStop={stopTranslation}
          onRetry={retry}
          onToggleFavorite={toggleFavorite}
          onUpdateFavorite={saveFavorite}
          onOpenInHome={openInHome}
        />
      )}
    </div>
  );
};
