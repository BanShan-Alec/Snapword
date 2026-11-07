import { t } from '@lingui/core/macro';
import { App } from 'antd';
import { useCallback } from 'react';

export function useArchitecture() {
  const { message } = App.useApp();

  const copyCode = useCallback(
    async (code: string) => {
      try {
        await navigator.clipboard.writeText(code);
        message.success(t`代码已复制`);
      } catch {
        message.error(t`复制代码失败`);
      }
    },
    [message],
  );

  return { copyCode };
}
