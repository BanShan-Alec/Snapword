import {
  STARTUP_REACT_FALLBACK_MS,
  STARTUP_UNMOUNT_DELAY_MS,
} from '../packages/shared/src/constants/startup';
import { expect, test } from './helpers/fixture';

type WindowWithCommitMark = Window & { __APP_REACT_COMMIT_AT__?: number };

test.describe('首屏渐进式加载 (First Screen Loading) E2E 验证', () => {
  // 时序断言只锁"最终态 + 兜底上界"（spec D7）：
  // 0.72s 动画 / 160ms 交叉淡入 / 500ms 退场的精确节奏归人工目测清单

  test('AC-1 双门禁达成：body 挂上 app-startup-ready（3000ms 兜底界内）', async ({ page }) => {
    await expect(page.locator('body')).toHaveClass(/app-startup-ready/, {
      timeout: STARTUP_REACT_FALLBACK_MS,
    });
  });

  test('AC-2 壳物理退场：ready 后 ≤1000ms #loading 从 DOM 移除', async ({ page }) => {
    await expect(page.locator('body')).toHaveClass(/app-startup-ready/, {
      timeout: STARTUP_REACT_FALLBACK_MS,
    });
    // 协调器在 ready 后 500ms remove #loading（非隐藏），1000ms 为断言上界
    await expect(page.locator('#loading')).toHaveCount(0, {
      timeout: STARTUP_UNMOUNT_DELAY_MS * 2,
    });
  });

  test('AC-3 React 首帧提交标记 __APP_REACT_COMMIT_AT__ 存在且为正数', async ({ page }) => {
    await expect(page.locator('body')).toHaveClass(/app-startup-ready/, {
      timeout: STARTUP_REACT_FALLBACK_MS,
    });
    const commitAt = await page.evaluate(
      () => (window as WindowWithCommitMark).__APP_REACT_COMMIT_AT__,
    );
    expect(commitAt).toBeDefined();
    expect(commitAt).toBeGreaterThan(0);
  });

  test('AC-4 稳定后主界面完全可见：#root computed opacity === 1', async ({ page }) => {
    await expect(page.locator('body')).toHaveClass(/app-startup-ready/, {
      timeout: STARTUP_REACT_FALLBACK_MS,
    });
    await expect(page.locator('#loading')).toHaveCount(0, {
      timeout: STARTUP_UNMOUNT_DELAY_MS * 2,
    });
    const opacity = await page.evaluate(
      () => getComputedStyle(document.getElementById('root')!).opacity,
    );
    expect(opacity).toBe('1');
  });

  test('AC-8 全局运行时环境基座：window.__APP_ENV__ 存在且被 Object.freeze 保护', async ({
    page,
  }) => {
    const envInfo = await page.evaluate(() => {
      const env = (window as any).__APP_ENV__;
      const isFrozen = Object.isFrozen(env);
      return { env, isFrozen };
    });
    expect(envInfo.env).toBeDefined();
    expect(envInfo.env.mode).toBe('test');
    expect(envInfo.isFrozen).toBe(true);
  });

  test('AC-5 入口隔离回归：Updater 窗口 DOM 不存在启动壳 #loading', async ({
    page,
    electronApp,
  }) => {
    // updater 是独立入口，未接壳（spec Out of Scope 第 4 条），打开回归验证
    const existing = electronApp.windows().find((w) => w.url().includes('updater'));
    let updaterPage = existing;
    if (!updaterPage) {
      const [win] = await Promise.all([
        electronApp.waitForEvent('window'),
        page.getByRole('button', { name: /检查更新|Check for updates/ }).click(),
      ]);
      await win.waitForLoadState('domcontentloaded');
      updaterPage = win;
    }
    expect(updaterPage.url()).toContain('updater');
    expect(await updaterPage.locator('#loading').count()).toBe(0);
    await updaterPage.close();
  });
});
