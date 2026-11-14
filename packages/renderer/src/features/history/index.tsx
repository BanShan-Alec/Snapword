import {
  BookOutlined,
  CheckOutlined,
  ClearOutlined,
  CopyOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  SearchOutlined,
  SoundOutlined,
  StarFilled,
  StarOutlined,
  TranslationOutlined,
} from '@ant-design/icons';
import type { TranslationHistoryItem } from '@app/shared/schemas/history';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Alert, Button, Empty, Input, Popconfirm, Radio, Spin, Tag, Tooltip } from 'antd';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { AppCard } from '@/components/ui/AppCard';
import { useHistory } from './hooks/useHistory';

export const HistoryFeature: React.FC = () => {
  useLingui();
  const [, navigate] = useLocation();
  const {
    items,
    rawCount,
    loading,
    search,
    setSearch,
    modeFilter,
    setModeFilter,
    handleDeleteItem,
    handleClearHistory,
  } = useHistory();

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [favoriteWords, setFavoriteWords] = useState<Set<string>>(new Set());

  // 同步检查当前列表中单词的收藏状态
  useEffect(() => {
    let mounted = true;
    const wordsToCheck = items
      .filter((i) => i.mode === 'word')
      .map((i) => i.text.trim().toLowerCase());

    if (wordsToCheck.length === 0) return;

    Promise.all(
      wordsToCheck.map(async (w) => {
        try {
          const res = await window.api?.vocabulary?.getByWord(w);
          return { word: w, isSaved: Boolean(res?.success && res.data && !res.data.deletedAt) };
        } catch {
          return { word: w, isSaved: false };
        }
      }),
    ).then((results) => {
      if (mounted) {
        const nextSet = new Set<string>();
        for (const r of results) {
          if (r.isSaved) nextSet.add(r.word);
        }
        setFavoriteWords(nextSet);
      }
    });

    const unbind = window.api?.vocabulary?.onChanged(() => {
      // 当生词本变更时重查
      Promise.all(
        wordsToCheck.map(async (w) => {
          try {
            const res = await window.api?.vocabulary?.getByWord(w);
            return { word: w, isSaved: Boolean(res?.success && res.data && !res.data.deletedAt) };
          } catch {
            return { word: w, isSaved: false };
          }
        }),
      ).then((results) => {
        if (mounted) {
          const nextSet = new Set<string>();
          for (const r of results) {
            if (r.isSaved) nextSet.add(r.word);
          }
          setFavoriteWords(nextSet);
        }
      });
    });

    return () => {
      mounted = false;
      unbind?.();
    };
  }, [items]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleSpeak = (text: string, lang = 'en-US') => {
    if (!text || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
  };

  const handleToggleFavoriteWord = async (item: TranslationHistoryItem) => {
    if (item.mode !== 'word' || !('senses' in item.result.data)) return;
    const wordData = item.result.data;
    const norm = item.text.trim().toLowerCase();
    const isSaved = favoriteWords.has(norm);

    if (!isSaved) {
      const res = await window.api?.vocabulary?.save({
        word: wordData.word,
        phoneticUs: wordData.phonetic_us,
        phoneticUk: wordData.phonetic_uk,
        contextSense: wordData.context_sense,
        contextSnippet: item.context,
        senses: wordData.senses,
      });
      if (res?.success) {
        setFavoriteWords((prev) => new Set([...prev, norm]));
      }
    }
  };

  return (
    <AppCard
      title={t`翻译历史`}
      extra={
        <span className="text-xs text-foreground-secondary">
          {t`共`} <strong className="text-primary font-semibold">{rawCount}</strong> {t`/ 20 条`}
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        {/* 顶部强提示：仅保留本次运行，退出后清空 (RM-04) */}
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          message={t`仅保留本次运行，退出后清空`}
          description={t`翻译历史存储在内存中（上限 20 条），方便本次会话随时回顾与重放。如需长期保存请收藏至生词本。`}
          className="rounded-xl border border-border"
        />

        {/* 工具栏：搜索、类型筛选、清空历史 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border select-none">
          <div className="flex items-center gap-3 flex-1 min-w-[260px]">
            <Input
              placeholder={t`搜索原文或译文...`}
              prefix={<SearchOutlined className="text-foreground-secondary" />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />

            <Radio.Group
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="all">{t`全部`}</Radio.Button>
              <Radio.Button value="word">{t`单词`}</Radio.Button>
              <Radio.Button value="sentence">{t`句子`}</Radio.Button>
            </Radio.Group>
          </div>

          <Popconfirm
            title={t`确认清空翻译历史？`}
            description={t`将清空本次运行的全部 20 条记录，不会影响生词本。`}
            okText={t`清空`}
            cancelText={t`取消`}
            okButtonProps={{ danger: true }}
            onConfirm={handleClearHistory}
            disabled={rawCount === 0}
          >
            <Button danger icon={<ClearOutlined />} disabled={rawCount === 0}>
              {t`清空历史`}
            </Button>
          </Popconfirm>
        </div>

        {/* 历史记录列表 */}
        {loading && items.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <Spin size="large" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div className="flex flex-col gap-1 text-sm text-foreground-secondary">
                  <span className="font-medium text-foreground">{t`还没有翻译记录`}</span>
                  <span>{t`在划词浮窗或主窗口发起的翻译将自动记录于此`}</span>
                </div>
              }
            >
              <Button type="primary" onClick={() => navigate('/')}>
                {t`去翻译`}
              </Button>
            </Empty>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border/60">
            {items.map((item) => {
              const isWord = item.mode === 'word';
              const isSaved = isWord && favoriteWords.has(item.text.trim().toLowerCase());
              const timeStr = new Date(item.timestamp).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              let resultText = '';
              if (item.mode === 'sentence' && 'text' in item.result.data) {
                resultText = item.result.data.text;
              } else if (item.mode === 'word' && 'senses' in item.result.data) {
                const senses = item.result.data.senses;
                resultText = senses.map((s) => `${s.pos} ${s.def}`).join('; ');
              }

              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 py-3 px-2 hover:bg-background-elevated/40 rounded-xl transition-colors"
                >
                  {/* 行首元信息 */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isWord ? (
                        <BookOutlined className="text-primary text-base" />
                      ) : (
                        <TranslationOutlined className="text-success text-base" />
                      )}

                      <Tag color={item.source === 'card' ? 'purple' : 'blue'}>
                        {item.source === 'card' ? t`划词` : t`手动`}
                      </Tag>

                      <span className="text-xs text-foreground-secondary font-mono">{timeStr}</span>
                    </div>

                    {/* 行操作 */}
                    <div className="flex items-center gap-1.5">
                      <Tooltip title={copiedId === item.id ? t`已复制` : t`复制译文`}>
                        <Button
                          type="text"
                          size="small"
                          icon={
                            copiedId === item.id ? (
                              <CheckOutlined className="text-success" />
                            ) : (
                              <CopyOutlined />
                            )
                          }
                          onClick={() => handleCopy(item.id, resultText)}
                          className="h-7 w-7 p-0"
                        />
                      </Tooltip>

                      <Tooltip title={t`朗读原文`}>
                        <Button
                          type="text"
                          size="small"
                          icon={<SoundOutlined />}
                          onClick={() => handleSpeak(item.text)}
                          className="h-7 w-7 p-0"
                        />
                      </Tooltip>

                      {/* 收藏仅对单词条目提供 (RM-04 / IA-43/44) */}
                      {isWord && (
                        <Tooltip title={isSaved ? t`已在生词本` : t`加入生词本`}>
                          <Button
                            type="text"
                            size="small"
                            icon={
                              isSaved ? <StarFilled className="text-warning" /> : <StarOutlined />
                            }
                            onClick={() => handleToggleFavoriteWord(item)}
                            className="h-7 w-7 p-0"
                          />
                        </Tooltip>
                      )}

                      <Tooltip title={t`删除此条`}>
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleDeleteItem(item.id)}
                          className="h-7 w-7 p-0"
                        />
                      </Tooltip>
                    </div>
                  </div>

                  {/* 原文 */}
                  <div className="text-sm font-medium text-foreground line-clamp-2">
                    {item.text}
                  </div>

                  {/* 译文 */}
                  <div className="text-xs text-foreground-secondary line-clamp-3 bg-background-elevated/60 p-2 rounded-lg border border-border/40">
                    {resultText}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppCard>
  );
};

export default HistoryFeature;
