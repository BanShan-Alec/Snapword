import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

/** 帮助与诊断页占位（RM-08 最小形态）：自检 / 日志 / 故障排查后续接入。 */
export const HelpPage = () => {
  useLingui();
  return (
    <PagePlaceholder
      title={t`帮助与诊断`}
      description={t`运行自检、查看日志与排查常见问题。`}
      emptyText={t`暂无可展示的诊断信息`}
    />
  );
};
