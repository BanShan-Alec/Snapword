---

title: 开发编排（Vite + Electron）
description: 单命令串联渲染层 dev server、preload 与主进程 watch 构建；生产预览校验产物并按进程树彻底清场。
---

# 开发编排（Vite + Electron）

> **TL;DR**：`pnpm dev` 编程式拉起 Vite Dev Server，同时启动 Preload 与 Main 双路增量构建；`pnpm preview` 一次性构建三包产物后以生产行为启动；退出时以递归方式彻底强杀全量子进程树。

## 1. 选型理由

Electron 项目的本地开发回路远比普通 Web 应用复杂：
- **四路并发时序**：渲染进程需要 Dev Server（HMR），Preload 模块需要增量打包，主进程需要增量构建并在代码变更时重启 Electron，三者启动存在强依赖关系。
- **孤儿僵尸进程**：关闭终端时，如果仅杀死主进程 PID，Chromium 的渲染进程、GPU 进程和 Utility 进程往往残留在系统后台，继续霸占单实例锁和本地端口。

工程通过统一的 `scripts/dev.ts` 脚本接管全生命周期，实现「一键拉起、细粒度热更、退出即清场」。

## 2. 核心机制

### 开发态三路装配与分级重载

→ 源码：[scripts/dev.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/scripts/dev.ts)

1. **渲染层**：编程式拉起 Vite，获取真实监听地址注入 `VITE_DEV_SERVER_URL`。
2. **Preload 层**：构建完成后，通过 Vite WebSocket 广播页面全量刷新（Full Reload）：
```ts
server.ws.send({ type: 'full-reload' });
```

3. **Main 主进程**：代码重建完成后，杀掉旧的 Electron 实例并重载拉起：
```ts
// packages/main 增量写入触发后
if (electronApp?.pid) {
  await killProcessTree(electronApp.pid);
}
electronApp = spawn(String(electronPath), [...args, '.'], { stdio: 'inherit' });
```

### 生产预览态（Preview）与快速启动

`pnpm preview` 提供无需真实打包的生产形态预演：
- 一次性构建 `@app/main`、`@app/preload`、`@app/renderer` 三包。
- 窗口直接加载本地 `file://` 静态 HTML 文件，模拟真实打包环境下的 CSP 安全策略与行为。
- 支持 `pnpm preview -- --skip-build`，启动前严格校验入口产物完整性，避免白屏挂死。

### 递归强杀子进程树（跨平台清场）

→ 源码：[scripts/port-guard.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/scripts/port-guard.ts)

```ts
export async function killProcessTree(pid: number): Promise<void> {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      try {
        execSync(`pkill -TERM -P ${pid}`, { stdio: 'ignore' });
      } catch {}
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        process.kill(pid, 'SIGKILL');
      }
    }
  } catch {}
}
```

## 3. 桌面端避坑注意事项

- **编程式 Dev Server vs CLI 启动**：
  - 必须使用 Vite 的编程式 API `createServer()`。只有这样才能可靠拿到 `server.resolvedUrls`，即使发生端口自愈顺延，透传给主进程的地址也能保持绝对准确。
- **Preview 模式严禁使用 Watch 监听**：
  - `pnpm preview` 的使命是检验打包静态产物。如果在预览态中混入热更新逻辑，将掩盖由于编译打包导致的文件路径解析错误（如 ASAR 内相对路径断裂）。
- **进程树清理必不可少**：
  - 无论在开发态重载还是终端收到 `SIGINT` 时，必须调用 `killProcessTree`。单杀主进程 PID 会在 Windows 和 macOS 上留下无头 Chromium 僵尸进程，导致后续二次启动直接闪退。
