import {
  CARD_WINDOW_MAX_WORK_AREA_RATIO,
  CARD_WINDOW_SNAP_MARGIN,
  CARD_WINDOW_WIDTH,
} from '@app/shared/constants/window-geometry';
import { describe, expect, it } from 'vitest';
import {
  calculateCardBounds,
  calculateCardRebound,
  type RectangleLike,
} from '../src/modules/window/card-geometry';
import { isEnglishText, resolveSelectionDispatch } from '../src/modules/window/card-shortcut';

describe('Card Window Subsystem (Slice-04)', () => {
  const mockWorkArea: RectangleLike = {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
  };

  describe('16px 视口边缘吸附与回弹算法 (RC-13)', () => {
    it('当拖拽至超出左/右边缘或过于贴近边缘 (<16px) 时，松手自动回弹到 16px 安全边距', () => {
      // 超出左边界
      const leftOutOfBounds = { x: -50, y: 300, width: 420, height: 260 };
      const leftRebound = calculateCardRebound(
        leftOutOfBounds,
        mockWorkArea,
        CARD_WINDOW_SNAP_MARGIN,
      );
      expect(leftRebound.rebounded).toBe(true);
      expect(leftRebound.x).toBe(16);

      // 超出右边界
      const rightOutOfBounds = { x: 1800, y: 300, width: 420, height: 260 };
      const rightRebound = calculateCardRebound(
        rightOutOfBounds,
        mockWorkArea,
        CARD_WINDOW_SNAP_MARGIN,
      );
      expect(rightRebound.rebounded).toBe(true);
      // 1920 - 420 - 16 = 1484
      expect(rightRebound.x).toBe(1484);
    });

    it('当拖拽至超出上/下边缘时，自动回弹到 16px 安全边距', () => {
      // 超出顶部
      const topOutOfBounds = { x: 500, y: 5, width: 420, height: 260 };
      const topRebound = calculateCardRebound(
        topOutOfBounds,
        mockWorkArea,
        CARD_WINDOW_SNAP_MARGIN,
      );
      expect(topRebound.rebounded).toBe(true);
      expect(topRebound.y).toBe(16);

      // 超出底部
      const bottomOutOfBounds = { x: 500, y: 950, width: 420, height: 260 };
      const bottomRebound = calculateCardRebound(
        bottomOutOfBounds,
        mockWorkArea,
        CARD_WINDOW_SNAP_MARGIN,
      );
      expect(bottomRebound.rebounded).toBe(true);
      // 1080 - 260 - 16 = 804
      expect(bottomRebound.y).toBe(804);
    });

    it('在安全边界内部松手不触发回弹', () => {
      const insideBounds = { x: 300, y: 300, width: 420, height: 260 };
      const result = calculateCardRebound(insideBounds, mockWorkArea, CARD_WINDOW_SNAP_MARGIN);
      expect(result.rebounded).toBe(false);
      expect(result.x).toBe(300);
      expect(result.y).toBe(300);
    });
  });

  describe('DIP 坐标计算与多屏/越界翻转 (RC-02/RC-03)', () => {
    it('常规选区默认定位在选区右下方 8px 处 (Priority 1)', () => {
      const selection = { x: 200, y: 200, width: 80, height: 24 };
      const bounds = calculateCardBounds({
        selectionRect: selection,
        cardSize: { width: 420, height: 260 },
        workArea: mockWorkArea,
      });

      expect(bounds.x).toBe(200 + 80 + 8); // 288
      expect(bounds.y).toBe(200 + 24 + 8); // 232
      expect(bounds.width).toBe(CARD_WINDOW_WIDTH);
      expect(bounds.height).toBe(260);
    });

    it('右下空间不足时，自动向内翻转至下方居中 (Priority 2)', () => {
      // 靠近屏幕右边界 (x: 1600)，右下放不下 420px，但下方居中可放下
      const selection = { x: 1600, y: 200, width: 100, height: 24 };
      const bounds = calculateCardBounds({
        selectionRect: selection,
        cardSize: { width: 420, height: 260 },
        workArea: mockWorkArea,
      });

      // 居中于选区 (1600 + 50 - 210 = 1440)
      expect(bounds.x).toBe(1440);
      expect(bounds.y).toBe(200 + 24 + 8);
    });

    it('下方空间不足时，自动向上翻转至选区上方居中 (Priority 3)', () => {
      // 靠近屏幕底部 (y: 950)，下方放不下 260px，上方居中可放下
      const selection = { x: 1600, y: 950, width: 100, height: 24 };
      const bounds = calculateCardBounds({
        selectionRect: selection,
        cardSize: { width: 420, height: 260 },
        workArea: mockWorkArea,
      });

      expect(bounds.x).toBe(1440);
      expect(bounds.y).toBe(950 - 8 - 260); // 682
    });

    it('四周均放不下时，翻转至屏幕右侧固定位置 (Priority 5)', () => {
      // 极端靠右边界 (x: 1800)，上方下方居中均超出屏幕
      const selection = { x: 1800, y: 950, width: 100, height: 24 };
      const bounds = calculateCardBounds({
        selectionRect: selection,
        cardSize: { width: 420, height: 260 },
        workArea: mockWorkArea,
      });

      // 屏幕右侧固定 16px: 1920 - 420 - 16 = 1484
      expect(bounds.x).toBe(1484);
    });

    it('卡片高度受控于 70% 工作区高度约束', () => {
      const selection = { x: 200, y: 200, width: 80, height: 24 };
      // 请求高度 900px，大于 1080 * 0.7 = 756px
      const bounds = calculateCardBounds({
        selectionRect: selection,
        cardSize: { width: 420, height: 900 },
        workArea: mockWorkArea,
      });

      expect(bounds.height).toBe(Math.floor(1080 * CARD_WINDOW_MAX_WORK_AREA_RATIO));
    });

    it('当存在用户手动拖拽历史时，优先沿用拖拽坐标并受 16px 安全边距限制', () => {
      const selection = { x: 200, y: 200, width: 80, height: 24 };
      const lastDraggedPosition = { x: 900, y: 400 };

      const bounds = calculateCardBounds({
        selectionRect: selection,
        cardSize: { width: 420, height: 240 },
        workArea: mockWorkArea,
        lastDraggedPosition,
      });

      expect(bounds.x).toBe(900);
      expect(bounds.y).toBe(400);
    });
  });

  describe('全局热键 Alt+W 与选区校验调度 (FR-11, RC-09, IA-23/24)', () => {
    it('无选区文本时直接返回内联提示「未获取到选中文本」，不发请求', () => {
      const dispatch = resolveSelectionDispatch('');
      expect(dispatch.action).toBe('notice');
      expect(dispatch.notice).toBe('未获取到选中文本');
    });

    it('非英文文本（英文占比 < 30%）直接返回「当前仅支持英文翻译」，不发请求', () => {
      const dispatch = resolveSelectionDispatch('这是一段测试文本');
      expect(dispatch.action).toBe('notice');
      expect(dispatch.notice).toBe('当前仅支持英文翻译');
    });

    it('合法英文单词自动推断为 word 模式', () => {
      const dispatch = resolveSelectionDispatch('electron');
      expect(dispatch.action).toBe('translate');
      expect(dispatch.mode).toBe('word');
    });

    it('合法英文长句自动推断为 sentence 模式', () => {
      const dispatch = resolveSelectionDispatch(
        'Build modern desktop applications with Electron and React.',
      );
      expect(dispatch.action).toBe('translate');
      expect(dispatch.mode).toBe('sentence');
    });

    it('英文占比 >= 30% 的中英混排能够通过英文校验', () => {
      expect(isEnglishText('React 19 是现代前端框架')).toBe(true);
    });
  });
});
