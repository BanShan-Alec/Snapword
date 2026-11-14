import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import type React from 'react';
import { AppCard } from '@/components/ui/AppCard';
import { VocabularyList } from './components/VocabularyList';
import { VocabularyToolbar } from './components/VocabularyToolbar';
import { VocabularyUndoBar } from './components/VocabularyUndoBar';
import { useVocabulary } from './hooks/useVocabulary';

export const VocabularyFeature: React.FC = () => {
  useLingui();
  const {
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
  } = useVocabulary();

  return (
    <AppCard
      title={t`生词本`}
      extra={
        <div className="flex items-center gap-2 text-xs text-foreground-secondary">
          <span>
            {t`已收藏`} <strong className="text-primary font-semibold">{total}</strong> {t`词`}
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <VocabularyToolbar
          total={total}
          search={search}
          onSearchChange={setSearch}
          selectedTag={selectedTag}
          onTagChange={setSelectedTag}
          availableTags={availableTags}
          sort={sort}
          onSortChange={setSort}
          onExportCsv={handleExportCsv}
          onClearAll={handleClearAll}
        />

        <VocabularyList words={words} loading={loading} onDeleteWord={handleDeleteWord} />

        {/* 5 秒软删除撤销 Bar (IA-37/38/39/40) */}
        <VocabularyUndoBar undoState={undoState} onUndo={handleUndo} />
      </div>
    </AppCard>
  );
};

export default VocabularyFeature;
