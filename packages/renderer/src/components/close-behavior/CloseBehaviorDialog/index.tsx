import type { CloseBehaviorChoice } from '@app/shared/schemas/close-behavior';
import { t } from '@lingui/core/macro';
import { App, Button } from 'antd';
import { memo, useEffect, useRef } from 'react';
import { callIpc } from '@/lib/ipc';

const _CloseBehaviorDialog = (_props: CloseBehaviorDialogProps) => {
  const { message, modal } = App.useApp();
  const trayActionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let currentModal: ReturnType<typeof modal.confirm> | null = null;

    const respond = async (choice: CloseBehaviorChoice) => {
      currentModal?.destroy();
      currentModal = null;
      try {
        await callIpc('window.closeRespond', [choice]);
      } catch (error) {
        logger.warn('Failed to submit close behavior choice:', error);
        message.error(t`提交关闭选择失败`);
        showPrompt();
      }
    };

    const showPrompt = () => {
      if (currentModal) return;
      currentModal = modal.confirm({
        title: t`关闭窗口还是退出应用？`,
        content: t`关闭后应用留在托盘，点击图标可重新打开。`,
        icon: null,
        centered: true,
        closable: true,
        mask: { enabled: true, closable: false },
        keyboard: false,
        okCancel: false,
        focusable: { autoFocusButton: null },
        afterOpenChange: (open) => {
          if (open) {
            trayActionRef.current?.focus();
          }
        },
        onCancel: () => {
          void respond('cancel');
        },
        footer: () => (
          <div className="flex justify-end gap-2 pt-4">
            <Button onClick={() => void respond('quit')}>{t`退出应用`}</Button>
            <Button
              ref={trayActionRef}
              autoFocus
              type="primary"
              onClick={() => void respond('window')}
            >
              {t`留在托盘`}
            </Button>
          </div>
        ),
      });
      requestAnimationFrame(() => trayActionRef.current?.focus());
    };

    const unsubscribe = window.api.window.onCloseRequested(showPrompt);
    void callIpc('window.closeReady').catch((error) => {
      logger.warn('Failed to register close prompt handler:', error);
    });

    return () => {
      unsubscribe();
      currentModal?.destroy();
    };
  }, [message, modal]);

  return null;
};

export type CloseBehaviorDialogProps = Record<string, never>;

export const CloseBehaviorDialog = memo(_CloseBehaviorDialog);
