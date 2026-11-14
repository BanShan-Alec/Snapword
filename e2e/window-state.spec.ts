import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MAX_WORK_AREA_RATIO,
  MAX_WORK_AREA_WIDTH_RATIO,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
} from '../packages/shared/src/constants/window-geometry';
import { launchElectronApp } from './helpers/electron';
import { expect, test } from './helpers/fixture';

test.describe('主窗口初始几何尺寸与工作区视觉居中 E2E 验证', () => {
  test('冷启动初始尺寸不溢出工作区且上下留白对称居中', async () => {
    // 独立冷启动：worker 级夹具可能已被其他 spec 复用，无法代表“首次创建”的几何状态
    const ctx = await launchElectronApp();
    try {
      // 等待首屏就绪
      await expect(ctx.page.locator('body')).toHaveClass(/app-startup-ready/, { timeout: 5000 });

      const metrics = await ctx.electronApp.evaluate(({ BrowserWindow, screen }) => {
        // 必须精确匹配 Home 主窗口，防止并发或前序测试残留的 Updater 窗口 (480x460) 造成干扰
        const homeWindow =
          BrowserWindow.getAllWindows().find(
            (w) => !w.isDestroyed() && w.isVisible() && !w.webContents.getURL().includes('updater'),
          ) ??
          BrowserWindow.getAllWindows().find(
            (w) => !w.isDestroyed() && !w.webContents.getURL().includes('updater'),
          ) ??
          BrowserWindow.getAllWindows()[0];

        const primaryDisplay = screen.getPrimaryDisplay();
        return {
          bounds: homeWindow.getBounds(),
          workArea: primaryDisplay.workArea,
        };
      });

      expect(metrics).toBeDefined();
      const { bounds, workArea } = metrics;

      // 1. 尺寸在当前显示器工作区以内，绝不溢出任务栏
      expect(bounds.width).toBeLessThanOrEqual(workArea.width);
      expect(bounds.height).toBeLessThanOrEqual(workArea.height);

      // 2. 宽高符合自适应算法：小屏受限时收缩，大屏满足标准尺寸
      //    容差 10px：Windows 无边框窗口的 getBounds() 含不可见 resize 边框（实测 +3/+8）
      const expectedWidth = Math.max(
        MIN_WINDOW_WIDTH,
        Math.min(DEFAULT_WINDOW_WIDTH, Math.floor(workArea.width * MAX_WORK_AREA_WIDTH_RATIO)),
      );
      const expectedHeight = Math.max(
        MIN_WINDOW_HEIGHT,
        Math.min(DEFAULT_WINDOW_HEIGHT, Math.floor(workArea.height * MAX_WORK_AREA_RATIO)),
      );

      expect(Math.abs(bounds.width - expectedWidth)).toBeLessThanOrEqual(10);
      expect(Math.abs(bounds.height - expectedHeight)).toBeLessThanOrEqual(10);

      // 3. 垂直视觉居中：上下留白基本对称（容差 10px，含上述边框差异）
      const topMargin = bounds.y - workArea.y;
      const bottomMargin = workArea.y + workArea.height - (bounds.y + bounds.height);
      expect(Math.abs(topMargin - bottomMargin)).toBeLessThanOrEqual(10);
    } finally {
      await ctx.cleanup();
    }
  });

  test('同一 userData 重启后恢复上次窗口 bounds', async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-e2e-restore-'));
    type Bounds = { x: number; y: number; width: number; height: number };
    let expected: Bounds | null = null;

    const first = await launchElectronApp({ userDataDir, cleanupUserData: false });
    try {
      const targetBounds: Bounds = { x: 120, y: 90, width: 900, height: 620 };
      const readBounds = () =>
        first.electronApp.evaluate(({ BrowserWindow }) => {
          const homeWindow = BrowserWindow.getAllWindows().find(
            (w) => !w.isDestroyed() && !w.webContents.getURL().includes('updater'),
          );
          return homeWindow?.getNormalBounds() ?? null;
        });

      await first.electronApp.evaluate(({ BrowserWindow }, bounds) => {
        const homeWindow = BrowserWindow.getAllWindows().find(
          (w) => !w.isDestroyed() && !w.webContents.getURL().includes('updater'),
        );
        if (!homeWindow) throw new Error('Home window not found');
        homeWindow.setBounds(bounds);
      }, targetBounds);

      // 等原生窗口真正应用新 bounds 并稳定（连续两次读数一致），替代固定 400ms 等待
      let previous: Bounds | null = null;
      await expect
        .poll(
          async () => {
            const current = await readBounds();
            const stable =
              previous !== null && JSON.stringify(current) === JSON.stringify(previous);
            previous = current;
            return stable;
          },
          { timeout: 5000, intervals: [150] },
        )
        .toBe(true);

      expected = await readBounds();
      expect(expected).not.toBeNull();
      // 确认 setBounds 真的生效（容差 10px，容纳 Windows 无边框窗口的边框差异）
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs((expected?.[key] ?? 0) - targetBounds[key])).toBeLessThanOrEqual(10);
      }
    } finally {
      await first.cleanup();
    }

    const second = await launchElectronApp({ userDataDir, cleanupUserData: false });
    try {
      const restored = await second.electronApp.evaluate(({ BrowserWindow }) => {
        const homeWindow = BrowserWindow.getAllWindows().find(
          (w) => !w.isDestroyed() && !w.webContents.getURL().includes('updater'),
        );
        return homeWindow?.getNormalBounds() ?? null;
      });
      if (!expected || !restored) throw new Error('Window bounds were not captured');
      // 容差 2px：跨进程恢复时 Windows 会对无边框窗口做一次舍入
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(restored[key] - expected[key])).toBeLessThanOrEqual(2);
      }
    } finally {
      await second.cleanup();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
