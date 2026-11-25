import {
  CARD_WINDOW_HEIGHT,
  CARD_WINDOW_MAX_WORK_AREA_RATIO,
  CARD_WINDOW_WIDTH,
} from '@app/shared/constants/window-geometry';
import { describe, expect, it } from 'vitest';
import { calculateCardBounds, type RectangleLike } from '../../src/modules/window/card-geometry';

describe('card-geometry 固定视口（400x280）几何与定位算法', () => {
  const standardWorkArea: RectangleLike = {
    x: 0,
    y: 0,
    width: 1920,
    height: 1040,
  };

  describe('固定视口尺寸与小屏夹限 (ADR-0006)', () => {
    it('标准 1080p 屏幕下，卡片物理尺寸恒为 400x280 DIPs', () => {
      const res = calculateCardBounds({
        selectionRect: { x: 300, y: 200, width: 100, height: 30 },
        workArea: standardWorkArea,
      });

      expect(res.width).toBe(400);
      expect(res.height).toBe(280);
      expect(res.width).toBe(CARD_WINDOW_WIDTH);
      expect(res.height).toBe(CARD_WINDOW_HEIGHT);
    });

    it('低分屏（工作区高度 720 DIPs）下，Math.floor(720 * 0.45)=324，高度维持 280 DIPs', () => {
      const lowResWorkArea: RectangleLike = { x: 0, y: 0, width: 1366, height: 720 };
      const res = calculateCardBounds({
        selectionRect: { x: 200, y: 100, width: 80, height: 24 },
        workArea: lowResWorkArea,
      });

      expect(res.width).toBe(400);
      expect(res.height).toBe(280);
    });

    it('极端小屏（工作区高度 500 DIPs）下，高度按 45% 比例夹限为 225 DIPs', () => {
      const tinyWorkArea: RectangleLike = { x: 0, y: 0, width: 800, height: 500 };
      const res = calculateCardBounds({
        selectionRect: { x: 100, y: 100, width: 80, height: 20 },
        workArea: tinyWorkArea,
      });

      expect(res.width).toBe(400);
      expect(res.height).toBe(Math.floor(500 * CARD_WINDOW_MAX_WORK_AREA_RATIO));
      expect(res.height).toBe(225);
    });

    it('极窄屏幕（工作区宽度 360 DIPs）下，宽度按工作区夹限为 328 DIPs', () => {
      const narrowWorkArea: RectangleLike = { x: 0, y: 0, width: 360, height: 800 };
      const res = calculateCardBounds({
        selectionRect: { x: 50, y: 50, width: 40, height: 20 },
        workArea: narrowWorkArea,
      });

      expect(res.width).toBe(328);
      expect(res.height).toBe(280);
    });
  });

  describe('calculateCardBounds 初始选区定位与自由拖拽沿用 (RC-02 / RC-13)', () => {
    it('优先级 1: 空间充裕时默认放置于选区右下 (rect.right + 8, rect.bottom + 8)', () => {
      const selectionRect = { x: 300, y: 200, width: 100, height: 30 };
      const res = calculateCardBounds({
        selectionRect,
        workArea: standardWorkArea,
      });

      expect(res.x).toBe(300 + 100 + 8); // 408
      expect(res.y).toBe(200 + 30 + 8); // 238
      expect(res.width).toBe(400);
      expect(res.height).toBe(280);
    });

    it('优先级 2: 右下越界时向内翻转至选区下方居中', () => {
      // 选区靠近右边界 (x: 1600)，右下放不下 400px (1600+100+8+400 > 1920)
      const selectionRect = { x: 1600, y: 200, width: 100, height: 30 };
      const res = calculateCardBounds({
        selectionRect,
        workArea: standardWorkArea,
      });

      // 选区下方居中 (centerX - w/2): 1650 - 200 = 1450
      expect(res.x).toBe(1450);
      expect(res.y).toBe(200 + 30 + 8); // 238
    });

    it('优先级 3: 下方均越界时翻转至选区上方居中', () => {
      // 选区位于右下角底部 (y: 950)，下方放不下 280px (950+30+8+280 > 1040)
      const selectionRect = { x: 1600, y: 950, width: 100, height: 30 };
      const res = calculateCardBounds({
        selectionRect,
        workArea: standardWorkArea,
      });

      // 选区上方居中: y = 950 - 8 - 280 = 662
      expect(res.x).toBe(1450);
      expect(res.y).toBe(662);
    });

    it('严格避让选区中心，不得被卡片遮挡', () => {
      const selectionRect = { x: 500, y: 500, width: 100, height: 40 };
      const res = calculateCardBounds({
        selectionRect,
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

    it('手动拖拽记录的贴边坐标 1:1 沿用，不被吸附回弹算法修改', () => {
      const selectionRect = { x: 200, y: 100, width: 80, height: 20 };
      // 贴近屏幕底边与左边（旧版 16px 回弹算法会篡改此类坐标）
      const lastDraggedPosition = { x: 0, y: 760 };

      const res = calculateCardBounds({
        selectionRect,
        workArea: standardWorkArea,
        lastDraggedPosition,
      });

      expect(res.x).toBe(0);
      expect(res.y).toBe(760);
      expect(res.width).toBe(400);
      expect(res.height).toBe(280);
    });

    it('无选区时，安全居中于屏幕底部', () => {
      const res = calculateCardBounds({
        selectionRect: null,
        workArea: standardWorkArea,
      });

      expect(res.x).toBe(Math.round((1920 - 400) / 2));
      expect(res.y).toBe(1040 - 280 - 24);
    });
  });
});
