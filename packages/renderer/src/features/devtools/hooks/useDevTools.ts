import { t } from '@lingui/core/macro';
import { PROJECT_DOCS_URL } from '@shared/constants/docs';
import type { PerformActionInput } from '@shared/schemas/diagnostics';
import { App } from 'antd';
import { useState } from 'react';
import { useManualRequest } from '@/hooks/useManualRequest';
import { callIpc } from '@/lib/ipc';

// 私有常量
const GITHUB_URL = 'https://github.com';
const BLOCKED_TEST_URL = 'https://example.com';
type DevToolsAction = { kind: 'toggleDevTools' } | { kind: 'openUrl'; url: string };

// 可抽离的逻辑处理函数/组件

/**
 * 开发者工具域：切换 DevTools、打开外部文档与非白名单拦截测试（过期响应自动丢弃）。
 */
export function useDevTools() {
  const { message } = App.useApp();
  const [actionMessage, setActionMessage] = useState<string>('');

  // 网络IO（显式触发）—— 单一动作通道
  const { runAsync: runDevToolsAction } = useManualRequest(
    async (action: DevToolsAction) => {
      const input: PerformActionInput =
        action.kind === 'toggleDevTools'
          ? { action: 'toggleDevTools' }
          : { action: 'openUrl', url: action.url };
      const data = await callIpc('diagnostics.performAction', [input]);
      // 用户动作只记结果：成功行在此补（失败已被 logIpc 中心化记录，不重复记）
      if (action.kind === 'toggleDevTools') {
        logger.info('DevTools toggled');
      } else {
        logger.info('External URL opened');
      }
      if (data.message === 'DevTools opened') {
        return t`已开启 DevTools`;
      }
      if (data.message === 'DevTools closed') {
        return t`已关闭 DevTools`;
      }
      if (data.message.startsWith('Opened ')) {
        const openedUrl = action.kind === 'openUrl' ? action.url : '';
        return t`已在默认浏览器中打开外部页面: ${openedUrl}`;
      }
      return data.message;
    },
    {
      onSuccess: (msg) => {
        setActionMessage(msg);
      },
      onError: (err) => {
        const detail = err.message;
        setActionMessage(t`安全拦截: ${detail}`);
        message.error(t`操作失败: ${detail}`);
      },
    },
  );

  // 逻辑处理函数
  const handleToggleDevTools = () => {
    void runDevToolsAction({ kind: 'toggleDevTools' }).catch(() => {
      // 过期响应 CancelledError 已丢弃；业务异常已由 onError 提示，此处防止未处理拒绝
    });
  };

  const handleOpenDocs = () => {
    void runDevToolsAction({ kind: 'openUrl', url: PROJECT_DOCS_URL }).catch(() => {});
  };

  const handleOpenGithub = () => {
    void runDevToolsAction({ kind: 'openUrl', url: GITHUB_URL }).catch(() => {});
  };

  const handleOpenBlockedUrl = () => {
    void runDevToolsAction({ kind: 'openUrl', url: BLOCKED_TEST_URL }).catch(() => {});
  };

  return {
    actionMessage,
    handleToggleDevTools,
    handleOpenDocs,
    handleOpenGithub,
    handleOpenBlockedUrl,
  };
}
