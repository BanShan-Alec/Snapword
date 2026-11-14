import type { SentenceTranslationResult } from '@app/shared/schemas/translate';
import type React from 'react';

export interface CardSentenceResultProps {
  streamingText: string;
  result: SentenceTranslationResult | null;
  isLoading: boolean;
  isStopped: boolean;
}

export const CardSentenceResult: React.FC<CardSentenceResultProps> = ({
  streamingText,
  result,
  isLoading,
  isStopped,
}) => {
  const displayText = result?.text || streamingText;

  return (
    <div className="flex flex-col gap-2.5 px-3 py-2.5 select-text">
      <div className="text-xs font-semibold text-foreground-secondary">中文译文</div>

      <div className="rounded-lg border border-border/50 bg-background-container p-3 shadow-xs">
        <div className="text-base leading-[1.65] text-foreground whitespace-pre-wrap font-sans">
          {displayText}
          {isLoading && (
            <span className="inline-block ml-0.5 font-bold text-primary animate-pulse">▌</span>
          )}
        </div>

        {isStopped && (
          <div className="mt-2 text-xs text-foreground-muted italic">
            已停止流式输出（保留当前已输出译文）
          </div>
        )}
      </div>
    </div>
  );
};
