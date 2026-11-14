import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { AppCard } from '@/components/ui/AppCard';
import { TranslationInput } from './components/TranslationInput';
import { TranslationResult } from './components/TranslationResult';
import { useTranslation } from './hooks/useTranslation';

// 私有常量

// 可抽离的逻辑处理函数/组件

/**
 * 翻译功能域入口（feature 唯一公开面）。
 */
function TranslationFeature() {
  useLingui();

  // 变量声明、解构
  const {
    text,
    setText,
    context,
    setContext,
    mode,
    setMode,
    effectiveMode,
    isLoading,
    streamingText,
    wordResult,
    sentenceResult,
    error,
    handleTranslate,
    handleAbort,
    handleClear,
  } = useTranslation();

  // 组件渲染
  return (
    <AppCard
      title={t`AI 流式翻译与词典`}
      extra={
        <span className="text-xs text-foreground-secondary">{t`日日新 SenseNova LLM 驱动`}</span>
      }
    >
      <div className="flex flex-col gap-4">
        <TranslationInput
          text={text}
          onTextChange={setText}
          context={context}
          onContextChange={setContext}
          mode={mode}
          onModeChange={setMode}
          effectiveMode={effectiveMode}
          isLoading={isLoading}
          onTranslate={handleTranslate}
          onAbort={handleAbort}
          onClear={handleClear}
        />

        <TranslationResult
          isLoading={isLoading}
          streamingText={streamingText}
          wordResult={wordResult}
          sentenceResult={sentenceResult}
          effectiveMode={effectiveMode}
          error={error}
        />
      </div>
    </AppCard>
  );
}

export { TranslationFeature };
export default TranslationFeature;
