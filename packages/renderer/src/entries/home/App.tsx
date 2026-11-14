import { memo, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Header } from '@/components/layout/Header';
import { SettingsFeature } from '@/features/settings';
import { TranslationFeature } from '@/features/translation';

/**
 * 路由切换叙事：每次路径变化落一行 info（首次渲染即初始路由）。
 * 「崩溃前用户翻到过哪页」是排障叙事的核心线索，主进程看不到这条线。
 */
function NavigationLogger() {
  const [location] = useLocation();
  useEffect(() => {
    logger.info('Route changed', { path: location });
  }, [location]);
  return null;
}

/**
 * 应用主界面壳层。业务路由由 Snapword 功能域接入时填充。
 */
const _App = () => {
  const [location] = useLocation();
  const isSettings = location === '/settings';

  return (
    <div className="h-screen flex flex-col bg-background text-foreground selection:bg-primary/20">
      {/* App Header & Navigation */}
      <Header />
      <NavigationLogger />

      {/* Main Content Area */}
      <main className="relative flex-1 min-h-0 w-full overflow-hidden">
        <div className="h-full w-full overflow-y-auto stable-scrollbar">
          <div className="max-w-7xl mx-auto p-6">
            {isSettings ? <SettingsFeature /> : <TranslationFeature />}
          </div>
        </div>
      </main>
    </div>
  );
};

export const App = memo(_App);
