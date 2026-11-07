import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import { Router } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { CloseBehaviorDialog } from '@/components/close-behavior/CloseBehaviorDialog';
import { AppProviders } from '@/components/layout/AppProviders';
import { StartupReadyNotifier } from '@/components/startup/StartupReadyNotifier';
import { initSentry } from '@/lib/sentry';
import { useAppStore } from '@/stores/useAppStore';
import { applyColorScheme } from '@/styles/design-tokens';
import { App } from './App.tsx';

initSentry();
// 生命周期叙事：每次文档加载即落盘（preload 先于页面脚本执行，logger 全局已就绪）
logger.info('Document started', { entry: 'home' });

// 幂等 re-assert data-theme 并挂 cssVar 作用域类（首帧已由主进程经 URL query 显式预置；css-var-app 必须早于 React 挂载）
applyColorScheme(useAppStore.getState().resolvedTheme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <Router hook={useHashLocation}>
        <StartupReadyNotifier />
        <CloseBehaviorDialog />
        <App />
      </Router>
    </AppProviders>
  </StrictMode>,
);
