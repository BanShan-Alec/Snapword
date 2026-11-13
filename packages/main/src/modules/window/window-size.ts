import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MAX_WORK_AREA_RATIO,
  MAX_WORK_AREA_WIDTH_RATIO,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  POSITION_TOLERANCE_X,
  POSITION_TOLERANCE_Y_BOTTOM,
  POSITION_TOLERANCE_Y_TOP,
} from '@app/shared/constants/window-geometry';
import type { Display, Rectangle } from 'electron';

/** 窗口几何状态：尺寸裁决纯函数与单测共用的类型契约 */
export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

/** 常量定义在 @app/shared/constants/window-geometry，此处仅为既有导入路径保留转发 */
export {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MAX_WORK_AREA_RATIO,
  MAX_WORK_AREA_WIDTH_RATIO,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  POSITION_TOLERANCE_X,
  POSITION_TOLERANCE_Y_BOTTOM,
  POSITION_TOLERANCE_Y_TOP,
};

/**
 * 边界截断函数，确保尺寸处于 [minimum, available] 区间内
 */
export function clampDimension(value: number, minimum: number, available: number): number {
  const maximum = Math.max(minimum, Math.floor(available));
  return Math.min(Math.max(Math.floor(value), minimum), maximum);
}

/**
 * 宽度优先自适应尺寸计算（用于冷启动无历史状态或历史尺寸超屏重置）
 * - 宽度优先满足 1024px，为 Dashboard 卡片和头部导航保留横向空间（不超过可用宽度 95%）
 * - 高度在小屏幕或 150% 缩放下动态压缩至工作区 85% 以内（如 1280x672 下约为 571px）
 * - 使用 clampDimension 确保尺寸在极小工作区下严格受控于 [MIN_WINDOW_*, workAreaSize.*]
 */
export function calculateAdaptiveInitialSize(workAreaSize: Pick<Rectangle, 'width' | 'height'>): {
  width: number;
  height: number;
} {
  const maxAllowedWidth = Math.floor(workAreaSize.width * MAX_WORK_AREA_WIDTH_RATIO);
  const maxAllowedHeight = Math.floor(workAreaSize.height * MAX_WORK_AREA_RATIO);

  const targetWidth = Math.max(MIN_WINDOW_WIDTH, Math.min(DEFAULT_WINDOW_WIDTH, maxAllowedWidth));
  const targetHeight = Math.max(
    MIN_WINDOW_HEIGHT,
    Math.min(DEFAULT_WINDOW_HEIGHT, maxAllowedHeight),
  );

  const width = clampDimension(targetWidth, MIN_WINDOW_WIDTH, workAreaSize.width);
  const height = clampDimension(targetHeight, MIN_WINDOW_HEIGHT, workAreaSize.height);

  return { width, height };
}

/**
 * 基于有效工作区（已剔除任务栏/Dock）计算绝对视觉居中坐标
 */
export function calculateCenteredCoordinates(
  size: Pick<Rectangle, 'width' | 'height'>,
  workArea: Rectangle,
): { x: number; y: number } {
  return {
    x: Math.round(workArea.x + (workArea.width - size.width) / 2),
    y: Math.round(workArea.y + (workArea.height - size.height) / 2),
  };
}

/**
 * 纯函数：综合裁决窗口几何状态
 * 1. 历史超屏保护：若存留的大屏尺寸（如 4K 1600x1000）超出当前工作区，直接重置为 85% 自适应尺寸
 * 2. 真实视觉居中：未记录坐标或坐标漂出有效工作区时，自动在目标显示器工作区居中
 * 3. 最大化状态独立记录
 */
export function resolveWindowBounds(
  persisted: Partial<WindowState> | null | undefined,
  targetDisplay: Pick<Display, 'workArea'>,
): WindowState {
  const { workArea } = targetDisplay;
  const isMaximized = Boolean(persisted?.isMaximized);

  // 1. 判定是否存在历史尺寸，以及是否超出当前显示器工作区（例如 4K 拔线切回笔记本）
  const hasHistorySize =
    typeof persisted?.width === 'number' &&
    typeof persisted?.height === 'number' &&
    persisted.width >= MIN_WINDOW_WIDTH &&
    persisted.height >= MIN_WINDOW_HEIGHT;

  const isOversized =
    hasHistorySize && (persisted.width! > workArea.width || persisted.height! > workArea.height);

  let width: number;
  let height: number;

  if (hasHistorySize && !isOversized) {
    width = clampDimension(persisted.width!, MIN_WINDOW_WIDTH, workArea.width);
    height = clampDimension(persisted.height!, MIN_WINDOW_HEIGHT, workArea.height);
  } else {
    // 首次启动或大屏历史尺寸超屏：走 85% 留白自适应尺寸
    const adaptive = calculateAdaptiveInitialSize(workArea);
    width = adaptive.width;
    height = adaptive.height;
  }

  // 2. 坐标裁决
  let x = persisted?.x;
  let y = persisted?.y;

  // 若尺寸发生超屏重置，或者坐标缺失/越界，则强制在当前工作区重新居中
  const isPositionInvalid =
    isOversized ||
    x === undefined ||
    y === undefined ||
    x < workArea.x - POSITION_TOLERANCE_X ||
    x > workArea.x + workArea.width - POSITION_TOLERANCE_X ||
    y < workArea.y - POSITION_TOLERANCE_Y_TOP ||
    y > workArea.y + workArea.height - POSITION_TOLERANCE_Y_BOTTOM;

  if (isPositionInvalid) {
    const centered = calculateCenteredCoordinates({ width, height }, workArea);
    x = centered.x;
    y = centered.y;
  }

  return {
    x,
    y,
    width,
    height,
    isMaximized,
  };
}
