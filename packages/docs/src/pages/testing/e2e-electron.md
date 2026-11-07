---

title: 端到端测试（Playwright）
description: Playwright 官方 `_electron` 真实拉起无边框窗口，Worker 级全局单次启动夹具与强制串行执行。
---

# 端到端测试（Playwright）

> **TL;DR**：借助 Playwright 原生 `_electron` 引擎拉起真实编译产物。采用 Worker 级单次冷启动夹具大幅压低测试耗时，结合隔离临时 `user-data-dir`、单 Worker 串行执行与强杀进程树守护，打造稳定不漂移的 E2E 体系。

## 1. 选型理由

- **真实 Electron 运行环境**：杜绝第三方 WebDriver（如 Spectron/Selenium）的中间桥接损耗与版本脱节，Playwright 官方直接通过 CDP 与 Electron 进程建立双向通信，完整覆盖 Native 窗口与 Preload 桥。
- **大幅压缩冷启动开销**：Electron 每次冷启动耗时 1.5s~3s，如果每个测试文件甚至每个测试用例都重新启动一次，E2E 矩阵将膨胀至数十分钟。通过 Worker 级夹具实现整个套件单次冷启动复用。
- **消除进程残留与僵尸状态**：桌面端测试若异常退出，残留的无头 Electron 进程会独占端口与单例锁，导致后续构建完全死锁。

## 2. 核心机制

### Worker 级全局冷启动扩展夹具

→ 源码：[e2e/helpers/fixture.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/e2e/helpers/fixture.ts)

```ts
import { test as base, type ElectronApplication, expect, type Page } from '@playwright/test';
import { type ElectronTestContext, launchElectronApp } from './electron';

export const test = base.extend<TestFixtures, WorkerFixtures>({
  electronCtx: [
    async ({}, use) => {
      // 1. 整个测试运行生命周期（单一 Worker）只执行一次冷启动
      const ctx = await launchElectronApp();
      await use(ctx);
      // 2. 全部用例完成后统一执行清理收尾
      await ctx.cleanup();
    },
    { scope: 'worker', auto: true },
  ],

  electronApp: [
    async ({ electronCtx }, use) => {
      await use(electronCtx.electronApp);
    },
    { scope: 'worker' },
  ],

  page: async ({ electronCtx }, use) => {
    // 复用已启动的主渲染窗口句柄
    await use(electronCtx.page);
  },
});
```

### 强隔离启动与强杀进程树

→ 源码：[e2e/helpers/electron.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/e2e/helpers/electron.ts)

```ts
export async function launchElectronApp(
  options: LaunchElectronOptions = {},
): Promise<ElectronTestContext> {
  const ownsUserDataDir = !options.userDataDir;
  const tempUserDataDir =
    options.userDataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'electron-e2e-'));

  const electronApp = await electron.launch({
    args: [
      '.',
      `--user-data-dir=${tempUserDataDir}`,
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      ...(options.extraArgs ?? []),
    ],
    env: { ...process.env, MODE: 'test', ...options.extraEnv },
  });

  return {
    electronApp,
    page: await electronApp.firstWindow(),
    tempUserDataDir,
    cleanup: async () => {
      try {
        await Promise.race([
          electronApp.close(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Close timeout')), 5000)),
        ]);
      } catch {
        killProcessTree(electronApp.process().pid); // 超时强杀进程树
      } finally {
        if (ownsUserDataDir) fs.rmSync(tempUserDataDir, { recursive: true, force: true });
      }
    },
  };
}
```

### 单 Worker 串行配置

→ 源码：[.config/playwright.config.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/.config/playwright.config.ts)

```ts
export default defineConfig({
  testDir: path.join(ROOT_DIR, 'e2e'),
  timeout: 45000,
  fullyParallel: false, // 必须禁止并发
  workers: 1, // 必须单 Worker 运行，规避多窗口聚焦抢占与单例锁冲突
});
```

## 3. 桌面端避坑注意事项

| 避坑要点               | 事故表现与原因                                                                                              | 本仓库对齐方案                                                                                                                                                 |
| :--------------------- | :---------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **单例锁与数据竞争**   | 若多用例共用默认系统 `userData`，已运行的本地开发进程会拦截测试实例启动并将其直接静默杀死。                 | 每次测试运行必须动态生成隔离的 `electron-e2e-*` 临时目录；需测试“跨重启持久化”时显式传入相同的 `userDataDir`。                                                 |
| **多 Worker 并发冲突** | 若 `workers > 1`，多个 Electron 窗口抢占 OS 桌面焦点、互相争抢系统托盘图标和文件锁，断言大面积偶发失败。    | Playwright 配置文件中严格锁定 `workers: 1` 且 `fullyParallel: false`。                                                                                         |
| **退出死锁与悬挂进程** | `electronApp.close()` 偶尔因未处理的异步 IPC 任务挂起，导致测试跑完后 CI 卡死直到整个 GitHub Actions 超时。 | 清理函数封装 `Promise.race`（5 秒限时），一旦超时立即调用跨平台 `killProcessTree`（Windows `taskkill /pid /T /F`，POSIX `pkill -9 -P`）并彻底摧毁 stdio 管道。 |
| **Linux 共享内存溢出** | CI 虚拟机 `/dev/shm` 空间狭小，Chromium 渲染大 DOM 时崩溃退出（SIGBUS）。                                   | 启动参数固定传入 `--disable-dev-shm-usage` 与 `--no-sandbox`。                                                                                                 |
