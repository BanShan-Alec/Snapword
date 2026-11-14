import type { TranslationHistoryItem } from '@app/shared/schemas/history';
import { App } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function useHistory() {
  const { message } = App.useApp();
  const [items, setItems] = useState<TranslationHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'word' | 'sentence'>('all');

  const loadHistory = useCallback(async () => {
    if (!window.api?.history?.get) return;
    setLoading(true);
    try {
      const res = await window.api.history.get();
      if (res?.success && Array.isArray(res.data)) {
        setItems(res.data);
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载历史记录失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    let mounted = true;
    window.api?.history
      ?.get()
      .then((res) => {
        if (mounted && res?.success && Array.isArray(res.data)) {
          setItems(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // 监听历史记录跨窗口/主进程实时广播 (RM-04)
  useEffect(() => {
    const unbind = window.api?.history?.onChanged((newItems) => {
      if (Array.isArray(newItems)) {
        setItems(newItems);
      }
    });
    return () => {
      unbind?.();
    };
  }, []);

  const handleDeleteItem = useCallback(
    async (id: string) => {
      if (!window.api?.history?.deleteItem) return;
      try {
        const res = await window.api.history.deleteItem({ id });
        if (res.success) {
          setItems((prev) => prev.filter((item) => item.id !== id));
        }
      } catch (err) {
        message.error(err instanceof Error ? err.message : '删除历史记录失败');
      }
    },
    [message],
  );

  const handleClearHistory = useCallback(async () => {
    if (!window.api?.history?.clear) return;
    try {
      const res = await window.api.history.clear();
      if (res.success) {
        setItems([]);
        message.success('已清空翻译历史');
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '清空失败');
    }
  }, [message]);

  // 搜索与类型过滤 (RM-04)
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (modeFilter !== 'all' && item.mode !== modeFilter) {
        return false;
      }
      if (!search.trim()) {
        return true;
      }
      const query = search.trim().toLowerCase();
      if (item.text.toLowerCase().includes(query)) {
        return true;
      }
      if (item.mode === 'sentence' && 'text' in item.result.data) {
        return item.result.data.text.toLowerCase().includes(query);
      }
      if (item.mode === 'word' && 'senses' in item.result.data) {
        const wordData = item.result.data;
        if (wordData.context_sense?.toLowerCase().includes(query)) return true;
        return wordData.senses.some(
          (s) => s.def.toLowerCase().includes(query) || s.example?.toLowerCase().includes(query),
        );
      }
      return false;
    });
  }, [items, search, modeFilter]);

  return {
    items: filteredItems,
    rawCount: items.length,
    loading,
    search,
    setSearch,
    modeFilter,
    setModeFilter,
    handleDeleteItem,
    handleClearHistory,
    refresh: loadHistory,
  };
}
