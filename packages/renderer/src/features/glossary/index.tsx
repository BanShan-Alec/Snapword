import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

/** 术语表域占位（RM-06 最小形态）：术语管理 / 导入导出 / 校验后续接入。 */
export const GlossaryFeature = () => {
  useLingui();
  return (
    <PagePlaceholder
      title={t`术语表`}
      description={t`统一管理术语与固定译法，保持译名一致。`}
      emptyText={t`还没有术语`}
    />
  );
};
