/**
 * 窗口几何契约（主进程窗口管理与单测共用的单一事实源）
 *
 * 数值对齐 docs/architecture.md（B-01）§10.2 主窗口约束。
 */

/** 主窗口默认尺寸 */
export const DEFAULT_WINDOW_WIDTH = 1200;
export const DEFAULT_WINDOW_HEIGHT = 800;

/** 主窗口最小尺寸（低于此值布局不可用） */
export const MIN_WINDOW_WIDTH = 960;
export const MIN_WINDOW_HEIGHT = 640;

/** 小屏幕安全呼吸比：高度最多占工作区 85%，宽度最多 95% */
export const MAX_WORK_AREA_RATIO = 0.85;
export const MAX_WORK_AREA_WIDTH_RATIO = 0.95;

/** 窗口坐标越界容差（逻辑像素 DIPs）：保证标题栏与顶部抓取区留在屏内 */
export const POSITION_TOLERANCE_X = 50;
export const POSITION_TOLERANCE_Y_TOP = 10;
export const POSITION_TOLERANCE_Y_BOTTOM = 50;
