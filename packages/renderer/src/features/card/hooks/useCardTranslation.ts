import type {
  SentenceTranslationResult,
  WordTranslationResult,
} from '@app/shared/schemas/translate';
import type { CardActionPayload } from '@app/shared/types/card';
import type {
  TranslationChunkEvent,
  TranslationErrorEvent,
  TranslationFinishEvent,
} from '@app/shared/types/translate';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useCardTranslation() {
  const [action, setAction] = useState<'idle' | 'notice' | 'translate'>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [context, setContext] = useState('');
  const [mode, setMode] = useState<'word' | 'sentence'>('word');
  const [isLoading, setIsLoading] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [wordResult, setWordResult] = useState<WordTranslationResult | null>(null);
  const [sentenceResult, setSentenceResult] = useState<SentenceTranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStopped, setIsStopped] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  const activeRequestIdRef = useRef<string | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSlowTimer = useCallback(() => {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
  }, []);

  const triggerTranslate = useCallback(
    async (targetText: string, targetContext = '', targetMode?: 'word' | 'sentence') => {
      const trimmed = targetText.trim();
      if (!trimmed) {
        setAction('notice');
        setNotice('未获取到选中文本');
        setIsLoading(false);
        return;
      }

      const inferredMode =
        targetMode ??
        (trimmed.length <= 120 && /^[a-zA-Z]+(?:-[a-zA-Z]+)*$/.test(trimmed) ? 'word' : 'sentence');

      const translationApi = window.api?.translation;
      if (!translationApi) {
        setError('翻译接口未初始化');
        return;
      }

      // 中止上一请求
      if (activeRequestIdRef.current) {
        try {
          await translationApi.abort({ requestId: activeRequestIdRef.current });
        } catch {
          // ignore
        }
      }

      clearSlowTimer();
      setAction('translate');
      setNotice(null);
      setError(null);
      setText(trimmed);
      setContext(targetContext);
      setMode(inferredMode);
      setStreamingText('');
      setWordResult(null);
      setSentenceResult(null);
      setIsStopped(false);
      setIsLoading(true);
      setIsSlow(false);

      // 3 秒无首包提示 (RC-09/RC-10)
      slowTimerRef.current = setTimeout(() => {
        setIsSlow(true);
      }, 3000);

      try {
        const res = await translationApi.translate({
          text: trimmed,
          context: targetContext,
          mode: inferredMode,
          source: 'card',
        });

        if (res.success && res.data?.requestId) {
          activeRequestIdRef.current = res.data.requestId;
        } else if (!res.success) {
          clearSlowTimer();
          setIsLoading(false);
          setError(res.error ?? '发起翻译请求失败');
        }
      } catch (err) {
        clearSlowTimer();
        setIsLoading(false);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [clearSlowTimer],
  );

  const stopTranslation = useCallback(async () => {
    if (activeRequestIdRef.current) {
      const reqId = activeRequestIdRef.current;
      activeRequestIdRef.current = null;
      try {
        await window.api?.translation?.abort({ requestId: reqId });
      } catch {
        // ignore
      }
    }
    clearSlowTimer();
    setIsLoading(false);
    setIsStopped(true);
  }, [clearSlowTimer]);

  const retry = useCallback(() => {
    if (text) {
      triggerTranslate(text, context, mode);
    }
  }, [text, context, mode, triggerTranslate]);

  const togglePin = useCallback(async () => {
    const next = !isPinned;
    setIsPinned(next);
    try {
      await window.api?.card?.setPin(next);
    } catch {
      // ignore
    }
  }, [isPinned]);

  const hideCard = useCallback(async () => {
    await stopTranslation();
    try {
      await window.api?.card?.hide();
    } catch {
      // ignore
    }
  }, [stopTranslation]);

  const openInHome = useCallback(async () => {
    const wasLoading = isLoading;
    await stopTranslation();
    try {
      await window.api?.card?.openInHome({
        text,
        context,
        mode,
        wordResult,
        sentenceResult,
        aborted: wasLoading,
      });
    } catch {
      // ignore
    }
  }, [text, context, mode, wordResult, sentenceResult, isLoading, stopTranslation]);

  const checkFavorite = useCallback(async (word: string) => {
    if (!word?.trim() || !window.api?.vocabulary?.getByWord) return;
    try {
      const res = await window.api.vocabulary.getByWord(word.trim());
      if (res?.success && res.data && !res.data.deletedAt) {
        setIsFavorite(true);
      } else {
        setIsFavorite(false);
      }
    } catch {
      // ignore
    }
  }, []);

  const saveFavorite = useCallback(async () => {
    if (!wordResult || !window.api?.vocabulary?.save) return;
    try {
      const res = await window.api.vocabulary.save({
        word: wordResult.word,
        phoneticUs: wordResult.phonetic_us,
        phoneticUk: wordResult.phonetic_uk,
        contextSense: wordResult.context_sense,
        contextSnippet: context.trim() || undefined,
        senses: wordResult.senses,
      });
      if (res?.success) {
        setIsFavorite(true);
      }
    } catch {
      // ignore
    }
  }, [wordResult, context]);

  const toggleFavorite = useCallback(() => {
    if (!isFavorite) {
      saveFavorite();
    }
  }, [isFavorite, saveFavorite]);

  // 监听生词本变更广播，实时同步收藏状态
  useEffect(() => {
    const unbind = window.api?.vocabulary?.onChanged(() => {
      if (wordResult?.word) {
        checkFavorite(wordResult.word);
      }
    });
    return () => {
      unbind?.();
    };
  }, [wordResult?.word, checkFavorite]);

  // 挂载主进程 Card 事件与 Translation 流式事件
  useEffect(() => {
    const cardApi = window.api?.card;
    const translationApi = window.api?.translation;

    const unbindCardAction = cardApi?.onAction((payload: CardActionPayload) => {
      if (payload.action === 'notice') {
        clearSlowTimer();
        setAction('notice');
        setNotice(payload.notice ?? '未获取到选中文本');
        setText(payload.text ?? '');
        setIsLoading(false);
        setWordResult(null);
        setSentenceResult(null);
        setStreamingText('');
      } else if (payload.action === 'translate') {
        triggerTranslate(payload.text ?? '', payload.context ?? '', payload.mode);
      }
    });

    const unbindChunk = translationApi?.onChunk((event: TranslationChunkEvent) => {
      if (event.requestId === activeRequestIdRef.current) {
        clearSlowTimer();
        setIsSlow(false);
        setStreamingText((prev) => prev + event.chunk);
      }
    });

    const unbindFinish = translationApi?.onFinish((event: TranslationFinishEvent) => {
      if (event.requestId === activeRequestIdRef.current) {
        clearSlowTimer();
        setIsLoading(false);
        setIsSlow(false);
        activeRequestIdRef.current = null;
        if (event.result.mode === 'word') {
          setWordResult(event.result.data);
          checkFavorite(event.result.data.word);
        } else {
          setSentenceResult(event.result.data);
          setStreamingText(event.result.data.text);
        }
      }
    });

    const unbindError = translationApi?.onError((event: TranslationErrorEvent) => {
      if (event.requestId === activeRequestIdRef.current) {
        clearSlowTimer();
        setIsLoading(false);
        setIsSlow(false);
        activeRequestIdRef.current = null;
        setError(event.error);
      }
    });

    return () => {
      clearSlowTimer();
      unbindCardAction?.();
      unbindChunk?.();
      unbindFinish?.();
      unbindError?.();
      if (activeRequestIdRef.current) {
        translationApi?.abort({ requestId: activeRequestIdRef.current });
      }
    };
  }, [triggerTranslate]);

  return {
    action,
    notice,
    text,
    context,
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
    triggerTranslate,
    stopTranslation,
    retry,
    togglePin,
    hideCard,
    openInHome,
    toggleFavorite,
    saveFavorite,
  };
}
