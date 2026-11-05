import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import { Router } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { AppProviders } from '@/components/layout/AppProviders';
import { StartupReadyNotifier } from '@/components/startup/StartupReadyNotifier';
import { initSentry } from '@/lib/sentry';
import { useAppStore } from '@/stores/useAppStore';
import { applyColorScheme } from '@/styles/design-tokens';
import { App } from './App.tsx';

// 仅生产打包且配置 DSN 时初始化；dev/test 直接 return
initSentry();
// 生命周期叙事：每次文档加载即落盘（preload 先于页面脚本执行，logger 全局已就绪）
logger.info('Document started', { entry: 'home' });

// 先切 data-theme/.dark（React 前的窗口画布由 --window-* 兜底，主题变量由 .dark 切换）
applyColorScheme(useAppStore.getState().resolvedTheme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <Router hook={useHashLocation}>
        <StartupReadyNotifier />
        <App />
      </Router>
    </AppProviders>
  </StrictMode>,
);
