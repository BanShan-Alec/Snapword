---

title: 多窗口入口（MPA）
description: 采用 MPA 架构隔离主窗口与更新弹窗，Vite 双物理入口与精确 manualChunks 分包。
---

# 多窗口入口（MPA）

> **TL;DR**：拒绝将 SPA 单页思维硬套在 Electron 多窗口上；主应用（home）与更新弹窗（updater）各自拥有独立的 HTML 入口与编译产物，更新小窗无需背负主应用的路由与业务组件包袱。

## 1. 选型理由

许多桌面开发者习惯把 Web 的 SPA 单入口搬进 Electron：
- 一个轻量的版本更新通知弹窗，由于共享同一 SPA 入口，不得不加载主应用庞大的路由树、图表库与几十个业务卡片。
- 主应用的逻辑异常或崩溃容易连带导致更新窗口无法弹出，用户丧失自我修复路径。

工程采用多页面应用（MPA）架构，在构建期实现物理层面的代码隔离。

## 2. 核心机制

### Vite 多页面物理入口与分包（manualChunks）

→ 源码：[packages/renderer/vite.config.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/renderer/vite.config.ts)

```ts
rollupOptions: {
  input: {
    home: path.resolve(currentDir, 'src/entries/home/index.html'),
    updater: path.resolve(currentDir, 'src/entries/updater/index.html'),
  },
  output: {
    chunkFileNames: 'assets/[name]-[hash].js',
    manualChunks(id) {
      if (id.includes('node_modules')) {
        // 核心 React 运行时（精准路径正则，避免 @lingui/react 等外围库污染）
        if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
          return 'vendor-react';
        }
        // UI 框架与基础控件库
        if (/[\\/]node_modules[\\/](antd|@ant-design|rc-[a-z0-9-]+)[\\/]/.test(id)) {
          return 'vendor-antd';
        }
      }
    },
  },
}
```

### 主进程按需加载与物理路径解析

主进程仅依赖统一的 URL / 本地文件路径抽象加载窗口，不感知前端打包实现：

→ 源码：[packages/main/src/index.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/index.ts)

```ts
initApp({
  windows: {
    home: devServer
      ? new URL('src/entries/home/index.html', devServer)
      : { path: require.resolve('@app/renderer') },
    updater: devServer
      ? new URL('src/entries/updater/index.html', devServer)
      : { path: require.resolve('@app/renderer/updater') },
  },
});
```

渲染包的 `package.json` 通过 `exports` 对外暴露确切的 HTML 物理路径：

```json
"exports": {
  ".": { "default": "./dist/src/entries/home/index.html" },
  "./updater": { "default": "./dist/src/entries/updater/index.html" }
}
```

## 3. 桌面端避坑注意事项

- **`manualChunks` 正则匹配必须包含路径分隔符**：
  - 严禁简单使用 `id.includes('react')` 进行分包匹配，否则名称包含 `react` 的第三方库（如 `@lingui/react`）会被错误混入底层的 React 核心块，破坏模块缓存稳定性。必须使用 `/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/` 进行精确路径正则过滤。
- **MPA 跨物理窗口状态同步单一真源原则**：
  - 多页面物理入口意味着各窗口拥有完全独立的 Chromium 渲染进程、独立的 JS 堆内存与独立的 Zustand 实例。跨物理窗口严禁试图通过 LocalStorage、BroadcastChannel 或 `window.opener` 直接通信，状态变更一律提交主进程，由主进程通过 `broadcast(channel, data)` 向全量注册窗口派发，保证数据单一事实源。
- **辅助小窗口的内存释放原则**：
  - 更新弹窗等辅助性小窗口应当是**按需创建、关闭即销毁**（Destroy on Close），避免在后台常驻无谓消耗 Chromium 渲染进程内存。
- **开发态路由穿透与 DevServer 联动**：
  - 在开发模式下，主进程根据 Vite Dev Server 的基础 URL 拼接目标 HTML 的相对路径；在生产预览与安装包下，直接加载本地 `file://` 静态产物，两套时序完全独立。
