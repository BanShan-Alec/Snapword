import type { VocabularyRecordDto } from '@app/shared/schemas/vocabulary';
import { App } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UndoDeleteState {
  batchId: string;
  affectedCount: number;
  wordNorms: string[];
  remainingSeconds: number;
}

export function useVocabulary() {
  const { message } = App.useApp();

  const [words, setWords] = useState<VocabularyRecordDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | undefined>(undefined);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [sort, setSort] = useState<'time' | 'alpha'>('time');

  // 5 秒软删除撤销状态机 (IA-37/38/39/40)
  const [undoState, setUndoState] = useState<UndoDeleteState | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const undoStateRef = useRef<UndoDeleteState | null>(null);

  useEffect(() => {
    undoStateRef.current = undoState;
  }, [undoState]);

  // 搜索防抖 (250ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => clearTimeout(handler);
  }, [search]);

  const clearUndoTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const loadWords = useCallback(async () => {
    if (!window.api?.vocabulary?.list) return;
    setLoading(true);
    try {
      const res = await window.api.vocabulary.list({
        search: debouncedSearch || undefined,
        tag: selectedTag || undefined,
        sort,
        limit: 200,
      });
      if (res?.success && res.data) {
        setWords(res.data.items);
        setTotal(res.data.total);

        // 收集所有现有标签
        const tagSet = new Set<string>();
        for (const item of res.data.items) {
          for (const t of item.tags) {
            tagSet.add(t);
          }
        }
        setAvailableTags(Array.from(tagSet));
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载生词本失败');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedTag, sort, message]);

  useEffect(() => {
    let mounted = true;
    window.api?.vocabulary
      ?.list({
        search: debouncedSearch || undefined,
        tag: selectedTag || undefined,
        sort,
        limit: 200,
      })
      .then((res) => {
        if (mounted && res?.success && res.data) {
          setWords(res.data.items);
          setTotal(res.data.total);

          const tagSet = new Set<string>();
          for (const item of res.data.items) {
            for (const t of item.tags) {
              tagSet.add(t);
            }
          }
          setAvailableTags(Array.from(tagSet));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [debouncedSearch, selectedTag, sort]);

  // 启动 5 秒撤销倒计时
  const startUndoCountdown = useCallback(
    (batchId: string, affectedCount: number, wordNorms: string[]) => {
      clearUndoTimer();
      setUndoState({
        batchId,
        affectedCount,
        wordNorms,
        remainingSeconds: 5,
      });

      timerRef.current = setInterval(() => {
        setUndoState((prev) => {
          if (!prev) return null;
          if (prev.remainingSeconds <= 1) {
            clearUndoTimer();
            return null; // 超时 5 秒撤销条自动消失 (IA-38)
          }
          return {
            ...prev,
            remainingSeconds: prev.remainingSeconds - 1,
          };
        });
      }, 1000);
    },
    [clearUndoTimer],
  );

  // 删除单个词条
  const handleDeleteWord = useCallback(
    async (record: VocabularyRecordDto) => {
      if (!window.api?.vocabulary?.deleteWord) return;
      try {
        const res = await window.api.vocabulary.deleteWord({ id: record.id });
        if (res.success && res.data) {
          // 立即从当前列表隐藏该词，总数减 1
          setWords((prev) => prev.filter((w) => w.id !== record.id));
          setTotal((prev) => Math.max(0, prev - 1));

          // 浮现 5 秒倒计时 Undo Bar
          startUndoCountdown(res.data.batchId, res.data.affectedCount, [record.wordNorm]);
        }
      } catch (err) {
        message.error(err instanceof Error ? err.message : '删除失败');
      }
    },
    [startUndoCountdown, message],
  );

  // 撤销删除 (IA-37/39)
  const handleUndo = useCallback(async () => {
    const current = undoStateRef.current;
    if (!current || !window.api?.vocabulary?.undoDelete) return;

    clearUndoTimer();
    setUndoState(null);

    try {
      const res = await window.api.vocabulary.undoDelete({ batchId: current.batchId });
      if (res.success) {
        message.success('已恢复已删除的单词');
        loadWords();
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '撤销失败');
    }
  }, [clearUndoTimer, loadWords, message]);

  // 清空全部生词 (IA-39)
  const handleClearAll = useCallback(async () => {
    if (!window.api?.vocabulary?.clearAll) return;
    try {
      const res = await window.api.vocabulary.clearAll();
      if (res.success && res.data) {
        const allNorms = words.map((w) => w.wordNorm);
        setWords([]);
        setTotal(0);
        // 仍提供 5 秒撤销 (IA-39)
        startUndoCountdown(res.data.batchId, res.data.affectedCount, allNorms);
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '清空生词本失败');
    }
  }, [words, startUndoCountdown, message]);

  // 导出 CSV (IA-28)
  const handleExportCsv = useCallback(async () => {
    if (!window.api?.vocabulary?.exportCsv) return;
    try {
      const res = await window.api.vocabulary.exportCsv();
      if (res.success && res.data) {
        const blob = new Blob([res.data.csv], {
          type: 'text/csv;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `snapword-vocabulary-${dateStr}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        message.success(`成功导出 ${res.data.count} 条生词记录`);
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '导出 CSV 失败');
    }
  }, [message]);

  // 监听跨窗口生词本变更广播
  useEffect(() => {
    const unbind = window.api?.vocabulary?.onChanged((payload) => {
      // 若在 5 秒内重新收藏同一词，撤销条自动收起 (IA-40)
      if (
        payload &&
        typeof payload === 'object' &&
        'action' in payload &&
        (payload as { action: string }).action === 'save'
      ) {
        const savedWord = (payload as { word?: string }).word;
        if (savedWord && undoStateRef.current) {
          const norm = savedWord.trim().toLowerCase();
          if (undoStateRef.current.wordNorms.includes(norm)) {
            clearUndoTimer();
            setUndoState(null);
          }
        }
      }

      loadWords();
    });

    return () => {
      clearUndoTimer();
      unbind?.();
    };
  }, [clearUndoTimer, loadWords]);

  return {
    words,
    total,
    loading,
    search,
    setSearch,
    selectedTag,
    setSelectedTag,
    availableTags,
    sort,
    setSort,
    undoState,
    handleDeleteWord,
    handleUndo,
    handleClearAll,
    handleExportCsv,
    refresh: loadWords,
  };
}
