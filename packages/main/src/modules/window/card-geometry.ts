import {
  CARD_WINDOW_HEIGHT,
  CARD_WINDOW_HORIZONTAL_CLAMP_PADDING,
  CARD_WINDOW_MAX_WORK_AREA_RATIO,
  CARD_WINDOW_MIN_MARGIN,
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
  workArea: RectangleLike;
  lastDraggedPosition?: DipPoint | { x: number; y: number } | null;
}

function clampToWorkArea(
  x: number,
  y: number,
  width: number,
  height: number,
  workArea: RectangleLike,
  safeMargin: number,
): { x: number; y: number } {
  const minX = workArea.x + safeMargin;
  const maxX = Math.max(minX, workArea.x + workArea.width - width - safeMargin);
  const minY = workArea.y + safeMargin;
  const maxY = Math.max(minY, workArea.y + workArea.height - height - safeMargin);

  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}

/**
 * 依据工作区与选区 DIP 坐标计算固定视口卡片（400×280）初始位置与几何边界 (RC-02 / RC-03)
 */
export function calculateCardBounds(options: CalculateCardBoundsOptions): CardBoundsResult {
  const { selectionRect, workArea, lastDraggedPosition } = options;

  // 1. 固定物理视口尺寸与小屏工作区上限夹限
  const targetWidth = Math.min(
    CARD_WINDOW_WIDTH,
    Math.max(100, Math.floor(workArea.width - CARD_WINDOW_HORIZONTAL_CLAMP_PADDING)),
  );
  const targetHeight = Math.min(
    CARD_WINDOW_HEIGHT,
    Math.floor(workArea.height * CARD_WINDOW_MAX_WORK_AREA_RATIO),
  );

  // 2. 若本次运行内有用户手动拖拽记忆，1:1 沿用拖拽坐标，不做多余吸附回弹 (RC-13)
  if (lastDraggedPosition) {
    return {
      x: lastDraggedPosition.x,
      y: lastDraggedPosition.y,
      width: targetWidth,
      height: targetHeight,
    };
  }

  // 3. 无选区时，兜底屏幕底部居中
  if (!selectionRect) {
    const fallbackX = Math.round(workArea.x + (workArea.width - targetWidth) / 2);
    const fallbackY = Math.round(workArea.y + workArea.height - targetHeight - 24);
    const clamped = clampToWorkArea(
      fallbackX,
      fallbackY,
      targetWidth,
      targetHeight,
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

  // 4. 选区中心避让判定 (RC-02: 卡片不得遮挡选区中心)
  const selectionCenterX = selectionRect.x + selectionRect.width / 2;
  const selectionCenterY = selectionRect.y + selectionRect.height / 2;

  const isPositionValid = (x: number, y: number): boolean => {
    if (
      x < workArea.x + CARD_WINDOW_MIN_MARGIN ||
      x + targetWidth > workArea.x + workArea.width - CARD_WINDOW_MIN_MARGIN ||
      y < workArea.y + CARD_WINDOW_MIN_MARGIN ||
      y + targetHeight > workArea.y + workArea.height - CARD_WINDOW_MIN_MARGIN
    ) {
      return false;
    }

    const coversCenter =
      selectionCenterX >= x &&
      selectionCenterX <= x + targetWidth &&
      selectionCenterY >= y &&
      selectionCenterY <= y + targetHeight;

    return !coversCenter;
  };

  // 优先级 1: 选区右下 (rect.right + 8, rect.bottom + 8)
  const bottomRightPos = {
    x: selectionRect.x + selectionRect.width + 8,
    y: selectionRect.y + selectionRect.height + 8,
  };
  if (isPositionValid(bottomRightPos.x, bottomRightPos.y)) {
    return { x: bottomRightPos.x, y: bottomRightPos.y, width: targetWidth, height: targetHeight };
  }

  // 优先级 2: 选区下方居中 (rect.centerX - w/2, rect.bottom + 8)
  const bottomCenterPos = {
    x: Math.round(selectionRect.x + (selectionRect.width - targetWidth) / 2),
    y: selectionRect.y + selectionRect.height + 8,
  };
  if (isPositionValid(bottomCenterPos.x, bottomCenterPos.y)) {
    return { x: bottomCenterPos.x, y: bottomCenterPos.y, width: targetWidth, height: targetHeight };
  }

  // 优先级 3: 选区上方居中 (rect.centerX - w/2, rect.top - 8 - h)
  const topCenterPos = {
    x: Math.round(selectionRect.x + (selectionRect.width - targetWidth) / 2),
    y: selectionRect.y - 8 - targetHeight,
  };
  if (isPositionValid(topCenterPos.x, topCenterPos.y)) {
    return { x: topCenterPos.x, y: topCenterPos.y, width: targetWidth, height: targetHeight };
  }

  // 优先级 4: 选区右侧 (rect.right + 8, rect.centerY - h/2)
  const rightCenterPos = {
    x: selectionRect.x + selectionRect.width + 8,
    y: Math.round(selectionRect.y + (selectionRect.height - targetHeight) / 2),
  };
  if (isPositionValid(rightCenterPos.x, rightCenterPos.y)) {
    return { x: rightCenterPos.x, y: rightCenterPos.y, width: targetWidth, height: targetHeight };
  }

  // 优先级 5: 屏幕右侧固定位置 (screen.right - w - 16, screen.centerY - h/2)
  const screenRightPos = {
    x: workArea.x + workArea.width - targetWidth - 16,
    y: Math.round(workArea.y + (workArea.height - targetHeight) / 2),
  };
  if (isPositionValid(screenRightPos.x, screenRightPos.y)) {
    return { x: screenRightPos.x, y: screenRightPos.y, width: targetWidth, height: targetHeight };
  }

  // 优先级 6: 屏幕底部居中 (screen.centerX - w/2, screen.bottom - h - 24)
  const screenBottomCenterPos = {
    x: Math.round(workArea.x + (workArea.width - targetWidth) / 2),
    y: workArea.y + workArea.height - targetHeight - 24,
  };
  const clamped = clampToWorkArea(
    screenBottomCenterPos.x,
    screenBottomCenterPos.y,
    targetWidth,
    targetHeight,
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
