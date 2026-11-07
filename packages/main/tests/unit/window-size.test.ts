import { describe, expect, it } from 'vitest';
import {
  calculateAdaptiveInitialSize,
  calculateCenteredCoordinates,
  clampDimension,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  resolveWindowBounds,
} from '../../src/modules/window/window-size';

describe('window-size 纯算法模块（B-01 §10.2 主窗口 1200×800 / 最小 960×640）', () => {
  describe('clampDimension', () => {
    it('在安全范围内保留原始值', () => {
      expect(clampDimension(1000, 960, 1200)).toBe(1000);
    });

    it('低于下限时提升至 minimum', () => {
      expect(clampDimension(600, 960, 1200)).toBe(960);
    });

    it('高于可用空间时截断至 available', () => {
      expect(clampDimension(1400, 960, 1200)).toBe(1200);
    });
  });

  describe('calculateAdaptiveInitialSize (自适应小屏留白)', () => {
    it('在 1080p @ 150% 缩放（逻辑 1280x672）下宽度满足 1200，高度顶到最小 640', () => {
      const size = calculateAdaptiveInitialSize({ width: 1280, height: 672 });
      expect(size.width).toBe(1200); // 宽度优先满足 1200（不超过可用宽度 95% = 1216）
      expect(size.height).toBe(640); // 85% 留白（571）低于最小高度，取 MIN_WINDOW_HEIGHT
      expect(size.height).toBeGreaterThanOrEqual(MIN_WINDOW_HEIGHT);
    });

    it('在 1366x768（逻辑 1366x720）笔记本屏幕下同样收敛到 1200x640', () => {
      const size = calculateAdaptiveInitialSize({ width: 1366, height: 720 });
      expect(size.width).toBe(1200);
      expect(size.height).toBe(640);
    });

    it('在标准 1080p @ 100%（工作区 1920x1032）大屏下采用默认 1200x800', () => {
      const size = calculateAdaptiveInitialSize({ width: 1920, height: 1032 });
      expect(size.width).toBe(DEFAULT_WINDOW_WIDTH);
      expect(size.height).toBe(DEFAULT_WINDOW_HEIGHT);
    });

    it('在极窄临界屏幕（如 740x520）下不低于最小下限 960x640', () => {
      const size = calculateAdaptiveInitialSize({ width: 740, height: 520 });
      expect(size.width).toBe(MIN_WINDOW_WIDTH);
      expect(size.height).toBe(MIN_WINDOW_HEIGHT);
    });

    it('在极端狭小屏幕下同样不低于最小下限 minWidth/minHeight', () => {
      const size = calculateAdaptiveInitialSize({ width: 600, height: 400 });
      expect(size.width).toBe(MIN_WINDOW_WIDTH);
      expect(size.height).toBe(MIN_WINDOW_HEIGHT);
    });
  });

  describe('calculateCenteredCoordinates (工作区视觉居中)', () => {
    it('在标准工作区居中计算上下左右对称坐标', () => {
      const workArea = { x: 0, y: 0, width: 1920, height: 1032 };
      const size = { width: 1200, height: 800 };
      const { x, y } = calculateCenteredCoordinates(size, workArea);

      expect(x).toBe(Math.round((1920 - 1200) / 2)); // 360
      expect(y).toBe(Math.round((1032 - 800) / 2)); // 116

      // 验证上下留白绝对对称
      const topMargin = y - workArea.y;
      const bottomMargin = workArea.y + workArea.height - (y + size.height);
      expect(topMargin).toBe(bottomMargin);
    });

    it('考虑副屏或任务栏偏移坐标（如顶部任务栏或副屏坐标偏移）', () => {
      const workArea = { x: 1920, y: 40, width: 1280, height: 680 };
      const size = { width: 1200, height: 640 };
      const { x, y } = calculateCenteredCoordinates(size, workArea);

      expect(x).toBe(1920 + Math.round((1280 - 1200) / 2));
      expect(y).toBe(40 + Math.round((680 - 640) / 2));
    });
  });

  describe('resolveWindowBounds (综合裁决与超屏保护)', () => {
    const laptop150Display = {
      workArea: { x: 0, y: 0, width: 1280, height: 672 },
    };

    it('初次启动（无持久化状态）自动计算 150% 缩放下的自适应尺寸与居中', () => {
      const bounds = resolveWindowBounds(undefined, laptop150Display);
      expect(bounds.width).toBe(1200);
      expect(bounds.height).toBe(640);
      expect(bounds.x).toBe(Math.round((1280 - 1200) / 2));
      expect(bounds.y).toBe(Math.round((672 - 640) / 2));
      expect(bounds.isMaximized).toBe(false);
    });

    it('4K 拔屏切回小屏：超屏历史尺寸直接重置为自适应尺寸并居中', () => {
      // 用户在外接 4K 屏曾拉到了 1600x1000
      const oversizedHistory = {
        width: 1600,
        height: 1000,
        x: 100,
        y: 100,
        isMaximized: false,
      };

      const bounds = resolveWindowBounds(oversizedHistory, laptop150Display);
      // 不按 1280x672 强制撑死屏幕，而是直接重置回自适应尺寸！
      expect(bounds.width).toBe(1200);
      expect(bounds.height).toBe(640);
      expect(bounds.x).toBe(Math.round((1280 - 1200) / 2));
      expect(bounds.y).toBe(Math.round((672 - 640) / 2));
    });

    it('历史尺寸在小屏容纳范围内时，正常保留用户自定义尺寸', () => {
      const validHistory = {
        width: 1000,
        height: 640,
        x: 100,
        y: 60,
        isMaximized: false,
      };

      const bounds = resolveWindowBounds(validHistory, laptop150Display);
      expect(bounds.width).toBe(1000);
      expect(bounds.height).toBe(640);
      expect(bounds.x).toBe(100);
      expect(bounds.y).toBe(60);
    });

    it('历史坐标飞出屏幕边界时自动重新居中', () => {
      const outOfBoundsHistory = {
        width: 1000,
        height: 640,
        x: 3000, // 远离屏幕的脏坐标
        y: 2000,
        isMaximized: false,
      };

      const bounds = resolveWindowBounds(outOfBoundsHistory, laptop150Display);
      expect(bounds.width).toBe(1000);
      expect(bounds.height).toBe(640);
      expect(bounds.x).toBe(Math.round((1280 - 1000) / 2));
      expect(bounds.y).toBe(Math.round((672 - 640) / 2));
    });

    it('保留最大化标志', () => {
      const maximizedHistory = {
        width: 1000,
        height: 640,
        x: 100,
        y: 60,
        isMaximized: true,
      };

      const bounds = resolveWindowBounds(maximizedHistory, laptop150Display);
      expect(bounds.isMaximized).toBe(true);
    });
  });
});
