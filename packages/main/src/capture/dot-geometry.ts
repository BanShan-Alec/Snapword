import type { DipPoint, DipRect } from '@app/shared/schemas/capture';

export const DOT_VISUAL_SIZE = 10;
export const DOT_HIT_SIZE = 24;
export const DOT_OFFSET = 8;
export const DOT_DEBOUNCE_MS = 300;
export const DOT_APPEAR_BUDGET_MS = 120;

/**
 * 依据 PRD RD-01 规范计算圆点坐标与越界翻转
 * 优先级顺序：
 * 1. 选区右下
 * 2. 选区左上
 * 3. 选区右侧垂直居中
 * 4. 鼠标指针右下
 * 5. 屏幕中央兜底
 */
export function calculateDotPosition(
  selectionRect: DipRect,
  pointer: DipPoint,
  screenWidth: number,
  screenHeight: number,
): DipPoint {
  const dotW = DOT_HIT_SIZE;
  const dotH = DOT_HIT_SIZE;
  const offset = DOT_OFFSET;

  // 优先级 1：选区右下 (selection bottom-right)
  const x1 = selectionRect.x + selectionRect.width + offset;
  const y1 = selectionRect.y + selectionRect.height + offset;
  if (x1 + dotW <= screenWidth && y1 + dotH <= screenHeight && x1 >= 0 && y1 >= 0) {
    return { x: x1, y: y1 };
  }

  // 优先级 2：选区左上 (selection top-left)
  const x2 = selectionRect.x - dotW - offset;
  const y2 = selectionRect.y - dotH - offset;
  if (x2 >= 0 && y2 >= 0 && x2 + dotW <= screenWidth && y2 + dotH <= screenHeight) {
    return { x: x2, y: y2 };
  }

  // 优先级 3：选区右侧垂直居中 (selection right-center)
  const x3 = selectionRect.x + selectionRect.width + offset;
  const y3 = selectionRect.y + (selectionRect.height - dotH) / 2;
  if (x3 + dotW <= screenWidth && y3 >= 0 && y3 + dotH <= screenHeight) {
    return { x: x3, y: y3 };
  }

  // 优先级 4：鼠标指针右下 (pointer bottom-right)
  const x4 = pointer.x + offset;
  const y4 = pointer.y + offset;
  if (x4 + dotW <= screenWidth && y4 + dotH <= screenHeight && x4 >= 0 && y4 >= 0) {
    return { x: x4, y: y4 };
  }

  // 优先级 5：屏幕中央兜底 (screen center fallback)
  return {
    x: (screenWidth - dotW) / 2,
    y: (screenHeight - dotH) / 2,
  };
}
