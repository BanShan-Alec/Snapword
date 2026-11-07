import { test as base, type ElectronApplication, expect, type Page } from '@playwright/test';
import { type ElectronTestContext, launchElectronApp } from './electron';

type TestFixtures = {
  page: Page;
  tempUserDataDir: string;
};

type WorkerFixtures = {
  electronCtx: ElectronTestContext;
  electronApp: ElectronApplication;
};

/**
 * 跨文件全局单次启动的 Playwright 扩展测试夹具 (Worker-scoped Electron + Test-scoped Page)
 *
 * 机制：
 * 1. 整个测试运行生命周期（单一 Worker）只执行一次 launchElectronApp()
 * 2. 覆盖默认的 page 夹具，使其直接桥接 Electron 的主渲染窗口，无需每个用例重复冷启动
 * 3. 所有用例跑完后自动触发 cleanup 统一销毁 Electron 进程
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  electronCtx: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require object destructuring pattern for dependency analysis
    async ({}, use) => {
      const ctx = await launchElectronApp();
      await use(ctx);
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
    // 复用已启动的 Electron 主窗口
    await use(electronCtx.page);
  },

  tempUserDataDir: async ({ electronCtx }, use) => {
    await use(electronCtx.tempUserDataDir);
  },
});

export { expect };
