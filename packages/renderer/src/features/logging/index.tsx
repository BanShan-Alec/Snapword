import { useEffect } from 'react';
import { LoggingCard } from './components/LoggingCard';
import { useLogging } from './hooks/useLogging';

// 私有常量

// 可抽离的逻辑处理函数/组件
/**
 * 日志域入口（feature 唯一公开面）。与 devtools 平级：两侧零共享 state（见 README「Feature 规范 4」）。
 */
function LoggingFeature() {
  // 变量声明、解构
  const {
    logStatus,
    isLoading,
    isTriggeringSentry,
    shouldCrashRender,
    handleSendLog,
    handleOpenLogFolder,
    handleTriggerSentryError,
    handleTriggerErrorBoundaryCrash,
  } = useLogging();

  // 若触发了 ErrorBoundary 测试，在 useEffect 生命周期中抛出异常以供 ErrorBoundary 捕获（避免 Render 阶段副作用）
  useEffect(() => {
    if (shouldCrashRender) {
      throw new Error('Test React ErrorBoundary component crash');
    }
  }, [shouldCrashRender]);

  // 组件渲染
  return (
    <LoggingCard
      logStatus={logStatus}
      isLoading={isLoading}
      isTriggeringSentry={isTriggeringSentry}
      onSendLog={handleSendLog}
      onOpenLogFolder={handleOpenLogFolder}
      onTriggerSentryError={handleTriggerSentryError}
      onTriggerErrorBoundaryCrash={handleTriggerErrorBoundaryCrash}
    />
  );
}

export { LoggingFeature };
export default LoggingFeature;
