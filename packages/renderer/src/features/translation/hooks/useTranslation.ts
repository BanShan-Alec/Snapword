import type {
  SentenceTranslationResult,
  WordTranslationResult,
} from '@app/shared/schemas/translate';
import type {
  TranslationChunkEvent,
  TranslationErrorEvent,
  TranslationFinishEvent,
} from '@app/shared/types/translate';
import { t } from '@lingui/core/macro';
import { App } from 'antd';
import { useEffect, useRef, useState } from 'react';

export type TranslationMode = 'auto' | 'word' | 'sentence';

export function useTranslation() {
  const { message } = App.useApp();

  const [text, setText] = useState('');
  const [context, setContext] = useState('');
  const [mode, setMode] = useState<TranslationMode>('auto');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [wordResult, setWordResult] = useState<WordTranslationResult | null>(null);
  const [sentenceResult, setSentenceResult] = useState<SentenceTranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 记录当前活跃的 requestId 引用，避免闭包捕获旧值
  const activeRequestIdRef = useRef<string | null>(null);

  // 自动推断模式：纯单英文单词走 word，多词或包含标点/句子走 sentence
  const trimmed = text.trim();
  const isSingleWord =
    trimmed.length > 0 && trimmed.length <= 120 && /^[a-zA-Z]+(?:-[a-zA-Z]+)*$/.test(trimmed);
  const effectiveMode: 'word' | 'sentence' =
    mode === 'auto' ? (isSingleWord ? 'word' : 'sentence') : mode;

  // 挂载主进程流式 IPC 事件监听
  useEffect(() => {
    const translationApi = window.api?.translation;
    if (!translationApi) return;

    const unbindChunk = translationApi.onChunk((event: TranslationChunkEvent) => {
      if (event.requestId === activeRequestIdRef.current) {
        setStreamingText((prev) => prev + event.chunk);
      }
    });

    const unbindFinish = translationApi.onFinish((event: TranslationFinishEvent) => {
      if (event.requestId === activeRequestIdRef.current) {
        setIsLoading(false);
        activeRequestIdRef.current = null;
        if (event.result.mode === 'word') {
          setWordResult(event.result.data);
        } else {
          setSentenceResult(event.result.data);
          setStreamingText(event.result.data.text);
        }
      }
    });

    const unbindError = translationApi.onError((event: TranslationErrorEvent) => {
      if (event.requestId === activeRequestIdRef.current) {
        setIsLoading(false);
        activeRequestIdRef.current = null;
        setError(event.error);
        message.error(event.error);
      }
    });

    return () => {
      unbindChunk();
      unbindFinish();
      unbindError();
      if (activeRequestIdRef.current) {
        translationApi.abort({ requestId: activeRequestIdRef.current });
      }
    };
  }, [message]);

  // 联动监听来自卡片的「在主窗口打开」(RC-18 / IA-25)
  useEffect(() => {
    const cardApi = window.api?.card;
    if (!cardApi?.onOpenInHome) return;

    const unbindOpenInHome = cardApi.onOpenInHome((payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const data = payload as {
        text?: string;
        context?: string;
        mode?: 'word' | 'sentence';
        wordResult?: WordTranslationResult;
        sentenceResult?: SentenceTranslationResult;
        aborted?: boolean;
      };

      if (typeof data.text === 'string') {
        setText(data.text);
      }
      if (typeof data.context === 'string') {
        setContext(data.context);
      }
      if (data.mode === 'word' || data.mode === 'sentence') {
        setMode(data.mode);
      }
      if (data.wordResult) {
        setWordResult(data.wordResult);
      }
      if (data.sentenceResult) {
        setSentenceResult(data.sentenceResult);
        setStreamingText(data.sentenceResult.text);
      }
      if (data.aborted) {
        setError('请求已中止 · 重新翻译');
      } else {
        setError(null);
      }
    });

    return () => {
      unbindOpenInHome();
    };
  }, []);

  const handleTranslate = async () => {
    if (!trimmed) {
      message.warning(t`请输入待翻译内容`);
      return;
    }

    const translationApi = window.api?.translation;
    if (!translationApi) {
      message.error(t`翻译接口未初始化`);
      return;
    }

    // 中止上一个请求
    if (activeRequestIdRef.current) {
      await translationApi.abort({ requestId: activeRequestIdRef.current });
    }

    setError(null);
    setStreamingText('');
    setWordResult(null);
    setSentenceResult(null);
    setIsLoading(true);

    try {
      const res = await translationApi.translate({
        mode: effectiveMode,
        text: trimmed,
        context: context.trim() || undefined,
        source: 'home',
      });

      if (!res.success) {
        setIsLoading(false);
        setError(res.error);
        message.error(res.error);
        return;
      }

      activeRequestIdRef.current = res.data.requestId;
    } catch (err: unknown) {
      setIsLoading(false);
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
      message.error(detail);
    }
  };

  const handleAbort = async () => {
    const reqId = activeRequestIdRef.current;
    if (reqId && window.api?.translation) {
      await window.api.translation.abort({ requestId: reqId });
      activeRequestIdRef.current = null;
      setIsLoading(false);
      message.info(t`翻译已中止`);
    }
  };

  const handleClear = () => {
    setText('');
    setContext('');
    setStreamingText('');
    setWordResult(null);
    setSentenceResult(null);
    setError(null);
  };

  return {
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
  };
}
