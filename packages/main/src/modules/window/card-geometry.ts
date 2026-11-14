import {
  CARD_WINDOW_DEFAULT_HEIGHT,
  CARD_WINDOW_MAX_WORK_AREA_RATIO,
  CARD_WINDOW_MIN_HEIGHT,
  CARD_WINDOW_MIN_MARGIN,
  CARD_WINDOW_SNAP_MARGIN,
  CARD_WINDOW_WIDTH,
} from '@app/shared/constants/window-geometry';
import type { DipPoint, DipRect } from '@app/shared/schemas/capture';

export interface RectangleLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CardBoundsResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CalculateCardBoundsOptions {
  selectionRect?: DipRect | RectangleLike | null;
  cardSize?: { width?: number; height?: number };
  workArea: RectangleLike;
  lastDraggedPosition?: DipPoint | { x: number; y: number } | null;
}

export interface CardReboundResult {
  x: number;
  y: number;
  width: number;
  height: number;
  rebounded: boolean;
}

/**
 * 依据工作区与选区 DIP 坐标计算卡片初始位置与几何边界 (RC-02 / RC-03)
 */
export function calculateCardBounds(options: CalculateCardBoundsOptions): CardBoundsResult {
  const { selectionRect, cardSize, workArea, lastDraggedPosition } = options;

  // 1. 宽度与高度自适应与限制
  const targetWidth = Math.min(
    CARD_WINDOW_WIDTH,
    Math.max(100, Math.floor(workArea.width - CARD_WINDOW_SNAP_MARGIN * 2)),
  );
  const maxAllowedHeight = Math.floor(workArea.height * CARD_WINDOW_MAX_WORK_AREA_RATIO);
  const requestedHeight = cardSize?.height ?? CARD_WINDOW_DEFAULT_HEIGHT;
  const targetHeight = Math.min(
    Math.max(requestedHeight, CARD_WINDOW_MIN_HEIGHT),
    maxAllowedHeight,
  );

  // 2. 若本次运行内有用户手动拖拽记忆，优先沿用拖拽位置并吸附回弹 (RC-13)
  if (lastDraggedPosition) {
    const rebound = calculateCardRebound(
      {
        x: lastDraggedPosition.x,
        y: lastDraggedPosition.y,
        width: targetWidth,
        height: targetHeight,
      },
      workArea,
      CARD_WINDOW_SNAP_MARGIN,
    );
    return {
      x: rebound.x,
      y: rebound.y,
      width: targetWidth,
      height: targetHeight,
    };
  }

  // 3. 无选区时，兜底屏幕底部居中
  if (!selectionRect) {
    const fallbackX = Math.round(workArea.x + (workArea.width - targetWidth) / 2);
    const fallbackY = Math.round(workArea.y + workArea.height - targetHeight - 24);
    const rebound = calculateCardRebound(
      { x: fallbackX, y: fallbackY, width: targetWidth, height: targetHeight },
      workArea,
      CARD_WINDOW_MIN_MARGIN,
    );
    return {
      x: rebound.x,
      y: rebound.y,
      width: targetWidth,
      height: targetHeight,
    };
  }

  // 4. 选区中心避让判定 (RC-02: 卡片不得遮挡选区中心)
  const selectionCenterX = selectionRect.x + selectionRect.width / 2;
  const selectionCenterY = selectionRect.y + selectionRect.height / 2;

  const isPositionValid = (x: number, y: number): boolean => {
    // 必须完整位于可用区域内，四周留有安全边距
    if (
      x < workArea.x + CARD_WINDOW_MIN_MARGIN ||
      x + targetWidth > workArea.x + workArea.width - CARD_WINDOW_MIN_MARGIN ||
      y < workArea.y + CARD_WINDOW_MIN_MARGIN ||
      y + targetHeight > workArea.y + workArea.height - CARD_WINDOW_MIN_MARGIN
    ) {
      return false;
    }

    // 严禁遮挡选区中心
    const coversCenter =
      selectionCenterX >= x &&
      selectionCenterX <= x + targetWidth &&
      selectionCenterY >= y &&
      selectionCenterY <= y + targetHeight;

    return !coversCenter;
  };

  // 优先级 1: 选区右下 (rect.right + 8, rect.bottom + 8)
  const p1 = {
    x: selectionRect.x + selectionRect.width + 8,
    y: selectionRect.y + selectionRect.height + 8,
  };
  if (isPositionValid(p1.x, p1.y)) {
    return { x: p1.x, y: p1.y, width: targetWidth, height: targetHeight };
  }

  // 优先级 2: 选区下方居中 (rect.centerX - w/2, rect.bottom + 8)
  const p2 = {
    x: Math.round(selectionRect.x + (selectionRect.width - targetWidth) / 2),
    y: selectionRect.y + selectionRect.height + 8,
  };
  if (isPositionValid(p2.x, p2.y)) {
    return { x: p2.x, y: p2.y, width: targetWidth, height: targetHeight };
  }

  // 优先级 3: 选区上方居中 (rect.centerX - w/2, rect.top - 8 - h)
  const p3 = {
    x: Math.round(selectionRect.x + (selectionRect.width - targetWidth) / 2),
    y: selectionRect.y - 8 - targetHeight,
  };
  if (isPositionValid(p3.x, p3.y)) {
    return { x: p3.x, y: p3.y, width: targetWidth, height: targetHeight };
  }

  // 优先级 4: 选区右侧 (rect.right + 8, rect.centerY - h/2)
  const p4 = {
    x: selectionRect.x + selectionRect.width + 8,
    y: Math.round(selectionRect.y + (selectionRect.height - targetHeight) / 2),
  };
  if (isPositionValid(p4.x, p4.y)) {
    return { x: p4.x, y: p4.y, width: targetWidth, height: targetHeight };
  }

  // 优先级 5: 屏幕右侧固定位置 (screen.right - w - 16, screen.centerY - h/2)
  const p5 = {
    x: workArea.x + workArea.width - targetWidth - 16,
    y: Math.round(workArea.y + (workArea.height - targetHeight) / 2),
  };
  if (isPositionValid(p5.x, p5.y)) {
    return { x: p5.x, y: p5.y, width: targetWidth, height: targetHeight };
  }

  // 优先级 6: 屏幕底部居中 (screen.centerX - w/2, screen.bottom - h - 24)
  const p6 = {
    x: Math.round(workArea.x + (workArea.width - targetWidth) / 2),
    y: workArea.y + workArea.height - targetHeight - 24,
  };
  const clamped = calculateCardRebound(
    { x: p6.x, y: p6.y, width: targetWidth, height: targetHeight },
    workArea,
    CARD_WINDOW_MIN_MARGIN,
  );
  return {
    x: clamped.x,
    y: clamped.y,
    width: targetWidth,
    height: targetHeight,
  };
}

/**
 * 拖拽边缘 16px 视口吸附回弹算法 (RC-13)
 */
export function calculateCardRebound(
  currentBounds: RectangleLike,
  workArea: RectangleLike,
  safeMargin = CARD_WINDOW_SNAP_MARGIN,
): CardReboundResult {
  const minX = workArea.x + safeMargin;
  const maxX = Math.max(minX, workArea.x + workArea.width - currentBounds.width - safeMargin);
  const minY = workArea.y + safeMargin;
  const maxY = Math.max(minY, workArea.y + workArea.height - currentBounds.height - safeMargin);

  const clampedX = Math.min(Math.max(currentBounds.x, minX), maxX);
  const clampedY = Math.min(Math.max(currentBounds.y, minY), maxY);

  const rebounded = clampedX !== currentBounds.x || clampedY !== currentBounds.y;

  return {
    x: clampedX,
    y: clampedY,
    width: currentBounds.width,
    height: currentBounds.height,
    rebounded,
  };
}
