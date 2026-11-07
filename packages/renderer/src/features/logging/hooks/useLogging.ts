import { t } from '@lingui/core/macro';
import { App } from 'antd';
import { useState } from 'react';
import { useManualRequest } from '@/hooks/useManualRequest';
import { callIpc } from '@/lib/ipc';

// 私有常量
type LogLevel = 'info' | 'warn' | 'error';
type LoggingAction = 'log' | 'openLogFolder';

// 可抽离的逻辑处理函数/组件

/**
 * 日志域：发送日志到主进程、打开日志目录（过期响应自动丢弃，单一 loading）。
 */
export function useLogging() {
  const { message } = App.useApp();
  const [logStatus, setLogStatus] = useState<string>('');

  // 网络IO（显式触发）—— 单一动作通道
  const { runAsync: runLogAction, loading: isLoading } = useManualRequest(
    async (action: { kind: LoggingAction; level: LogLevel }) => {
      const levelUpper = action.level.toUpperCase();
      if (action.kind === 'log') {
        logger[action.level](`Test ${levelUpper} log emitted from Renderer`);
        return t`✅ 已发送 ${levelUpper} 日志到 renderer-home.log`;
      }
      const data = await callIpc('diagnostics.openLogFolder');
      logger.info('Log folder opened');
      const { path } = data;
      return t`📂 已打开日志目录: ${path}`;
    },
    {
      onSuccess: (status) => {
        setLogStatus(status);
      },
      onError: (err) => {
        const detail = err.message;
        message.error(t`日志操作失败: ${detail}`);
      },
    },
  );

  // 逻辑处理函数
  const handleSendLog = (level: LogLevel) => {
    void runLogAction({ kind: 'log', level }).catch(() => {
      // 过期响应 CancelledError 已丢弃；业务异常已由 onError 提示，此处防止未处理拒绝
    });
  };

  const handleOpenLogFolder = () => {
    void runLogAction({ kind: 'openLogFolder', level: 'info' }).catch(() => {});
  };

  const [isTriggeringSentry, setIsTriggeringSentry] = useState(false);

  const handleTriggerSentryError = () => {
    if (isTriggeringSentry) {
      return;
    }
    setIsTriggeringSentry(true);
    setTimeout(() => {
      setIsTriggeringSentry(false);
    }, 1500);

    const errorMsg = 'Test Sentry exception triggered from UI';
    const err = new Error(errorMsg);

    // 1. 记录本地落盘日志到 renderer-home.log
    logger.error(errorMsg, { triggeredFrom: 'UI' });

    // 2. 更新 UI 状态提示
    setLogStatus(
      t`❌ 已触发测试异常并写入 renderer-home.log (生产打包模式下将由全局监听器自动上报 Sentry)`,
    );
    message.error(t`已触发测试异常，已写入 renderer-home.log`);

    // 3. 异步抛出异常至全局执行栈，交由 window.onerror 全局监听器捕获
    setTimeout(() => {
      throw err;
    }, 0);
  };

  const [shouldCrashRender, setShouldCrashRender] = useState(false);

  const handleTriggerErrorBoundaryCrash = () => {
    const errorMsg = 'Test React ErrorBoundary component crash triggered from UI';
    // 记录本地落盘日志
    logger.error(errorMsg, { triggeredFrom: 'UI' });

    setShouldCrashRender(true);
  };

  return {
    logStatus,
    isLoading,
    isTriggeringSentry,
    shouldCrashRender,
    handleSendLog,
    handleOpenLogFolder,
    handleTriggerSentryError,
    handleTriggerErrorBoundaryCrash,
  };
}
