import { BookOutlined, HistoryOutlined, TranslationOutlined } from '@ant-design/icons';
import type { TranslationHistoryItem } from '@app/shared/schemas/history';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import type React from 'react';
import { useEffect, useState } from 'react';

export interface RecentTranslationsProps {
  onSelect: (item: TranslationHistoryItem) => void;
}

export const RecentTranslations: React.FC<RecentTranslationsProps> = ({ onSelect }) => {
  useLingui();
  const [recentItems, setRecentItems] = useState<TranslationHistoryItem[]>([]);

  useEffect(() => {
    let mounted = true;

    window.api?.history
      ?.get()
      .then((res) => {
        if (mounted && res?.success && Array.isArray(res.data)) {
          setRecentItems(res.data.slice(0, 5));
        }
      })
      .catch(() => {});

    const unbind = window.api?.history?.onChanged((newItems) => {
      if (mounted && Array.isArray(newItems)) {
        setRecentItems(newItems.slice(0, 5));
      }
    });

    return () => {
      mounted = false;
      unbind?.();
    };
  }, []);

  if (recentItems.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-border/60">
      <div className="flex items-center gap-1.5 text-xs text-foreground-secondary font-medium">
        <HistoryOutlined className="text-primary" />
        <span>{t`最近翻译（点击恢复展示）`}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
        {recentItems.map((item) => {
          const isWord = item.mode === 'word';
          let preview = '';
          if (item.mode === 'sentence' && 'text' in item.result.data) {
            preview = item.result.data.text;
          } else if (item.mode === 'word' && 'senses' in item.result.data) {
            preview = item.result.data.senses[0]?.def || '';
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className="flex flex-col gap-1 p-2.5 text-left rounded-xl bg-background-elevated/60 hover:bg-background-elevated border border-border/60 hover:border-primary/40 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-1.5 text-xs">
                {isWord ? (
                  <BookOutlined className="text-primary shrink-0" />
                ) : (
                  <TranslationOutlined className="text-success shrink-0" />
                )}
                <span className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                  {item.text}
                </span>
              </div>

              {preview && (
                <div className="text-xs text-foreground-secondary truncate">{preview}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
