---

title: 路由（Wouter）
description: 采用轻量级 Wouter 驱动，useHashLocation 深度适配本地 file:// 协议。
---

# 路由（Wouter）

> **TL;DR**：采用体积仅约 2KB 的 Wouter 替代笨重的 React Router；在 Electron 桌面端使用 `useHashLocation`（Hash 路由）适配本地 `file://` 加载协议，未知路径统一兜底重定向，路由轨迹打入系统日志。

## 1. 选型理由

桌面客户端内部的页面切换面临两大特定约束：
1. **本地协议限制（`file://`）**：在生产打包态下，窗口通过 `file://` 协议加载本地静态 HTML。若使用传统的 Browser History API（路径路由），页面刷新或深层跳转时因缺乏后端 Web 服务器配合 rewrite，将直接触发物理文件 404 错误。Hash 路由（带有 `#`）完全在浏览器内存中解析，天然适配桌面端。
2. **轻量与性能追求**：React Router 体积庞大且附带大量适用于 SSR 的上下文依赖。Wouter 极度轻巧（~2.1KB gzip），无侵入式 Provider，更适合资源敏感的客户端。

## 2. 核心机制

### 挂载 Hash 路由协议

在页面顶层装配 `useHashLocation` 驱动：

→ 源码：[packages/renderer/src/entries/home/index.tsx](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/renderer/src/entries/home/index.tsx)

```tsx
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
```

### 路由定义与未知路径兜底重定向

在 `App.tsx` 内部内聚 `NavigationLogger` 监听路径变更并记录落盘日志，同时使用 `replace` 收敛非法路径：

→ 源码：[packages/renderer/src/entries/home/App.tsx](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/renderer/src/entries/home/App.tsx)

```tsx
function NavigationLogger() {
  const [location] = useLocation();
  useEffect(() => {
    logger.info('Route changed', { path: location });
  }, [location]);
  return null;
}

export const App = memo(() => (
  <div className="h-screen flex flex-col bg-background text-foreground">
    <Header />
    <NavigationLogger />
    <main className="flex-1 overflow-y-auto">
      <Switch>
        <Route path="/dashboard">
          <DashboardFeature />
        </Route>
        <Route path="/architecture">
          <ArchitectureFeature />
        </Route>
        {/* 根路径与未知非法路径统一收敛重定向至 /dashboard */}
        <Route path="/*">
          <Redirect to="/dashboard" replace />
        </Route>
      </Switch>
    </main>
  </div>
));
```

## 3. 桌面端避坑注意事项

- **生产打包严禁使用 Browser History API**：
  - 切勿在主窗口或多窗口中切换回 HTML5 History 路由模式。一旦在无 Dev Server 托管的本地文件路径下触发跳转，Chromium 无法定位虚拟 URL，必定导致白屏或 `ERR_FILE_NOT_FOUND`。
- **未知路径必须做 `replace` 重定向**：
  - 兜底路由必须加上 `<Redirect to="/dashboard" replace />` 的 `replace` 属性，防止将无效路由压入 Hash 历史栈导致用户在界面上“后退”时陷入死循环。
- **MPA 窗口不需要全局大路由**：
  - 更新弹窗（Updater）等独立物理窗口拥有自己独立的 HTML 页面，不要把主应用的 Wouter 路由树引到辅助小窗口中。
