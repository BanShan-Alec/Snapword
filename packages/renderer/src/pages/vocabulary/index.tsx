import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

/** 生词本页占位（RM-05 最小形态）：收藏 / 搜索 / 导出随链路接入。 */
export const VocabularyPage = () => {
  useLingui();
  return (
    <PagePlaceholder
      title={t`生词本`}
      description={t`收藏的单词与语境片段，随时回看。`}
      emptyText={t`还没有收藏单词`}
    />
  );
};
