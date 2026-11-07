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

describe('window-size 纯算法模块', () => {
  describe('clampDimension', () => {
    it('在安全范围内保留原始值', () => {
      expect(clampDimension(900, 720, 1200)).toBe(900);
    });

    it('低于下限时提升至 minimum', () => {
      expect(clampDimension(600, 720, 1200)).toBe(720);
    });

    it('高于可用空间时截断至 available', () => {
      expect(clampDimension(1400, 720, 1200)).toBe(1200);
    });
  });

  describe('calculateAdaptiveInitialSize (自适应小屏留白)', () => {
    it('在 1080p @ 150% 缩放（逻辑 1280x672）下高度压降至 85% 留出呼吸感', () => {
      const size = calculateAdaptiveInitialSize({ width: 1280, height: 672 });
      expect(size.width).toBe(1024); // 宽度优先满足 1024
      expect(size.height).toBe(571); // Math.floor(672 * 0.85) = 571
      expect(size.height).toBeLessThan(672);
      expect(size.height).toBeGreaterThanOrEqual(MIN_WINDOW_HEIGHT);
    });

    it('在 1366x768（逻辑 1366x720）笔记本屏幕下高度自适应收缩至 612px', () => {
      const size = calculateAdaptiveInitialSize({ width: 1366, height: 720 });
      expect(size.width).toBe(1024);
      expect(size.height).toBe(612); // Math.floor(720 * 0.85) = 612
    });

    it('在标准 1080p @ 100%（工作区 1920x1032）大屏下采用默认 1024x700', () => {
      const size = calculateAdaptiveInitialSize({ width: 1920, height: 1032 });
      expect(size.width).toBe(DEFAULT_WINDOW_WIDTH);
      expect(size.height).toBe(DEFAULT_WINDOW_HEIGHT);
    });

    it('在极窄临界屏幕（如 740x520）下严格截断在工作区可用尺寸内', () => {
      const size = calculateAdaptiveInitialSize({ width: 740, height: 520 });
      expect(size.width).toBeLessThanOrEqual(740);
      expect(size.height).toBeLessThanOrEqual(520);
      expect(size.width).toBe(720);
      expect(size.height).toBe(480);
    });

    it('在极端狭小屏幕下不低于最小下限 minWidth/minHeight', () => {
      const size = calculateAdaptiveInitialSize({ width: 600, height: 400 });
      expect(size.width).toBe(MIN_WINDOW_WIDTH);
      expect(size.height).toBe(MIN_WINDOW_HEIGHT);
    });
  });

  describe('calculateCenteredCoordinates (工作区视觉居中)', () => {
    it('在标准工作区居中计算上下左右对称坐标', () => {
      const workArea = { x: 0, y: 0, width: 1920, height: 1032 };
      const size = { width: 1024, height: 700 };
      const { x, y } = calculateCenteredCoordinates(size, workArea);

      expect(x).toBe(Math.round((1920 - 1024) / 2)); // 448
      expect(y).toBe(Math.round((1032 - 700) / 2)); // 166

      // 验证上下留白绝对对称
      const topMargin = y - workArea.y;
      const bottomMargin = workArea.y + workArea.height - (y + size.height);
      expect(topMargin).toBe(bottomMargin);
    });

    it('考虑副屏或任务栏偏移坐标（如顶部任务栏或副屏坐标偏移）', () => {
      const workArea = { x: 1920, y: 40, width: 1280, height: 680 };
      const size = { width: 1024, height: 571 };
      const { x, y } = calculateCenteredCoordinates(size, workArea);

      expect(x).toBe(1920 + Math.round((1280 - 1024) / 2));
      expect(y).toBe(40 + Math.round((680 - 571) / 2));
    });
  });

  describe('resolveWindowBounds (综合裁决与超屏保护)', () => {
    const laptop150Display = {
      workArea: { x: 0, y: 0, width: 1280, height: 672 },
    };

    it('初次启动（无持久化状态）自动计算 150% 缩放下的自适应尺寸与居中', () => {
      const bounds = resolveWindowBounds(undefined, laptop150Display);
      expect(bounds.width).toBe(1024);
      expect(bounds.height).toBe(571);
      expect(bounds.x).toBe(Math.round((1280 - 1024) / 2));
      expect(bounds.y).toBe(Math.round((672 - 571) / 2));
      expect(bounds.isMaximized).toBe(false);
    });

    it('Grill-me 核心决策：4K 拔屏切回小屏，超屏历史尺寸直接重置为 85% 舒适尺寸并居中', () => {
      // 用户在外接 4K 屏曾拉到了 1600x1000
      const oversizedHistory = {
        width: 1600,
        height: 1000,
        x: 100,
        y: 100,
        isMaximized: false,
      };

      const bounds = resolveWindowBounds(oversizedHistory, laptop150Display);
      // 坚决不按 1280x672 强制撑死屏幕，而是直接重置回自适应尺寸！
      expect(bounds.width).toBe(1024);
      expect(bounds.height).toBe(571);
      expect(bounds.x).toBe(Math.round((1280 - 1024) / 2));
      expect(bounds.y).toBe(Math.round((672 - 571) / 2));
    });

    it('历史尺寸在小屏容纳范围内时，正常保留用户自定义尺寸', () => {
      const validHistory = {
        width: 900,
        height: 520,
        x: 100,
        y: 60,
        isMaximized: false,
      };

      const bounds = resolveWindowBounds(validHistory, laptop150Display);
      expect(bounds.width).toBe(900);
      expect(bounds.height).toBe(520);
      expect(bounds.x).toBe(100);
      expect(bounds.y).toBe(60);
    });

    it('历史坐标飞出屏幕边界时自动重新居中', () => {
      const outOfBoundsHistory = {
        width: 900,
        height: 520,
        x: 3000, // 远离屏幕的脏坐标
        y: 2000,
        isMaximized: false,
      };

      const bounds = resolveWindowBounds(outOfBoundsHistory, laptop150Display);
      expect(bounds.width).toBe(900);
      expect(bounds.height).toBe(520);
      expect(bounds.x).toBe(Math.round((1280 - 900) / 2));
      expect(bounds.y).toBe(Math.round((672 - 520) / 2));
    });

    it('保留最大化标志', () => {
      const maximizedHistory = {
        width: 900,
        height: 520,
        x: 100,
        y: 60,
        isMaximized: true,
      };

      const bounds = resolveWindowBounds(maximizedHistory, laptop150Display);
      expect(bounds.isMaximized).toBe(true);
    });
  });
});
