import { CARD_WINDOW_WIDTH } from '@app/shared/constants/window-geometry';
import { describe, expect, it } from 'vitest';
import {
  calculateCardBounds,
  calculateCardRebound,
  type RectangleLike,
} from '../../src/modules/window/card-geometry';

describe('card-geometry 翻译卡片几何与定位算法', () => {
  const standardWorkArea: RectangleLike = {
    x: 0,
    y: 0,
    width: 1920,
    height: 1040,
  };

  describe('calculateCardRebound 16px 视口吸附与回弹算法 (RC-13)', () => {
    it('在安全边界内部时不触发回弹', () => {
      const bounds = { x: 200, y: 200, width: 420, height: 300 };
      const res = calculateCardRebound(bounds, standardWorkArea, 16);
      expect(res.rebounded).toBe(false);
      expect(res.x).toBe(200);
      expect(res.y).toBe(200);
    });

    it('超出左边缘或过于贴近左边缘时自动回弹至 16px 安全边距', () => {
      const bounds = { x: 5, y: 100, width: 420, height: 300 };
      const res = calculateCardRebound(bounds, standardWorkArea, 16);
      expect(res.rebounded).toBe(true);
      expect(res.x).toBe(16);
      expect(res.y).toBe(100);
    });

    it('超出右边缘时自动回弹至 16px 安全边距', () => {
      const bounds = { x: 1600, y: 100, width: 420, height: 300 };
      const res = calculateCardRebound(bounds, standardWorkArea, 16);
      expect(res.rebounded).toBe(true);
      // 1920 - 420 - 16 = 1484
      expect(res.x).toBe(1484);
      expect(res.y).toBe(100);
    });

    it('超出顶部边缘时自动回弹至 16px 安全边距', () => {
      const bounds = { x: 200, y: -20, width: 420, height: 300 };
      const res = calculateCardRebound(bounds, standardWorkArea, 16);
      expect(res.rebounded).toBe(true);
      expect(res.y).toBe(16);
    });

    it('超出底部边缘时自动回弹至 16px 安全边距', () => {
      const bounds = { x: 200, y: 900, width: 420, height: 300 };
      const res = calculateCardRebound(bounds, standardWorkArea, 16);
      expect(res.rebounded).toBe(true);
      // 1040 - 300 - 16 = 724
      expect(res.y).toBe(724);
    });
  });

  describe('calculateCardBounds 初始选区定位算法 (RC-02 / RC-03)', () => {
    it('优先级 1: 空间充裕时默认放置于选区右下 (rect.right + 8, rect.bottom + 8)', () => {
      const selectionRect = { x: 300, y: 200, width: 100, height: 30 };
      const res = calculateCardBounds({
        selectionRect,
        cardSize: { width: 420, height: 260 },
        workArea: standardWorkArea,
      });

      expect(res.x).toBe(300 + 100 + 8); // 408
      expect(res.y).toBe(200 + 30 + 8); // 238
      expect(res.width).toBe(CARD_WINDOW_WIDTH);
      expect(res.height).toBe(260);
    });

    it('优先级 2: 右下越界时向内翻转至选区下方居中', () => {
      // 选区靠近右边界 (x: 1600)，右下放不下 420px (1600+100+8+420 > 1920)
      const selectionRect = { x: 1600, y: 200, width: 100, height: 30 };
      const res = calculateCardBounds({
        selectionRect,
        cardSize: { width: 420, height: 260 },
        workArea: standardWorkArea,
      });

      // 选区下方居中 (centerX - w/2): 1650 - 210 = 1440
      expect(res.x).toBe(1440);
      expect(res.y).toBe(200 + 30 + 8); // 238
    });

    it('优先级 3: 下方均越界时翻转至选区上方居中', () => {
      // 选区位于右下角底部 (y: 950)，下方放不下 260px (950+30+8+260 > 1040)
      const selectionRect = { x: 1600, y: 950, width: 100, height: 30 };
      const res = calculateCardBounds({
        selectionRect,
        cardSize: { width: 420, height: 260 },
        workArea: standardWorkArea,
      });

      // 选区上方居中: y = 950 - 8 - 260 = 682
      expect(res.x).toBe(1440);
      expect(res.y).toBe(682);
    });

    it('严格避让选区中心，不得被卡片遮挡', () => {
      const selectionRect = { x: 500, y: 500, width: 100, height: 40 };
      const res = calculateCardBounds({
        selectionRect,
        cardSize: { width: 420, height: 240 },
        workArea: standardWorkArea,
      });

      const centerX = selectionRect.x + selectionRect.width / 2;
      const centerY = selectionRect.y + selectionRect.height / 2;
      const overlaps =
        centerX >= res.x &&
        centerX <= res.x + res.width &&
        centerY >= res.y &&
        centerY <= res.y + res.height;

      expect(overlaps).toBe(false);
    });

    it('高度受控于工作区 70% 上限', () => {
      const selectionRect = { x: 200, y: 100, width: 80, height: 20 };
      // 请求 900px 高度，超过 1040 * 0.7 = 728
      const res = calculateCardBounds({
        selectionRect,
        cardSize: { width: 420, height: 900 },
        workArea: standardWorkArea,
      });

      expect(res.height).toBe(728);
    });

    it('本次运行内存在手动拖拽记忆时，优先沿用并吸附安全边距', () => {
      const selectionRect = { x: 200, y: 100, width: 80, height: 20 };
      const lastDraggedPosition = { x: 800, y: 400 };

      const res = calculateCardBounds({
        selectionRect,
        cardSize: { width: 420, height: 240 },
        workArea: standardWorkArea,
        lastDraggedPosition,
      });

      expect(res.x).toBe(800);
      expect(res.y).toBe(400);
    });

    it('无选区时，安全居中于屏幕底部', () => {
      const res = calculateCardBounds({
        selectionRect: null,
        cardSize: { width: 420, height: 240 },
        workArea: standardWorkArea,
      });

      expect(res.x).toBe(Math.round((1920 - 420) / 2));
      expect(res.y).toBe(1040 - 240 - 24);
    });
  });
});
