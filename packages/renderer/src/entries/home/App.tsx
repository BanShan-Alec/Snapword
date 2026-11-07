import { memo, useEffect, useState } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';
import { Header } from '@/components/layout/Header';
import { ArchitectureFeature } from '@/features/architecture';
import { DashboardFeature } from '@/features/dashboard';
import { DocsFeature } from '@/features/docs';

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
 * 应用主界面内容编排（传统 Switch/Route 声明式切换）。
 * 壳层 Provider 已由 AppProviders 与 Router 统包。
 */
const _App = () => {
  const [location] = useLocation();
  const isDocs = location.startsWith('/docs');
  const [docsMounted, setDocsMounted] = useState(isDocs);

  // 文档站首次访问才挂载，之后保持挂载（keep-alive），切走只隐藏不卸载
  useEffect(() => {
    if (isDocs) {
      setDocsMounted(true);
    }
  }, [isDocs]);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground selection:bg-primary/20">
      {/* App Header & Navigation */}
      <Header />
      <NavigationLogger />

      {/* Main Content Area */}
      {/* 滚动容器必须是全宽 wrapper：max-w/mx-auto 一旦挂到滚动容器上，宽窗口下滚动条会随内容区一起被居中推离窗口右缘 */}
      <main className="relative flex-1 min-h-0 w-full overflow-hidden">
        {!isDocs && (
          <div className="h-full w-full overflow-y-auto stable-scrollbar">
            <div className="max-w-7xl mx-auto p-6">
              <Switch>
                <Route path="/dashboard">
                  <DashboardFeature />
                </Route>
                <Route path="/architecture">
                  <ArchitectureFeature />
                </Route>
                {/* 默认根路径与未知路径统一重定向到 /dashboard */}
                <Route path="/*">
                  <Redirect to="/dashboard" replace />
                </Route>
              </Switch>
            </div>
          </div>
        )}

        {/* 文档站 iframe 全出血铺满 header 以下区域；隐藏时用 visibility 保住内部滚动位置 */}
        {docsMounted && (
          <div
            aria-hidden={!isDocs}
            className={
              isDocs ? 'absolute inset-0' : 'absolute inset-0 invisible pointer-events-none'
            }
          >
            <DocsFeature />
          </div>
        )}
      </main>
    </div>
  );
};

export const App = memo(_App);
