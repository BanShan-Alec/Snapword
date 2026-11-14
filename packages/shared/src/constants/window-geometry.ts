/**
 * 窗口几何契约（主进程窗口管理与 E2E 共用的单一事实源）
 *
 * 这些值决定用户可见的窗口尺寸与超屏保护行为，产品改动后
 * e2e/window-state.spec.ts 会自动跟随，不再另行抄写一份。
 */

/** 主窗口默认尺寸 */
export const DEFAULT_WINDOW_WIDTH = 1024;
export const DEFAULT_WINDOW_HEIGHT = 700;

/** 主窗口最小尺寸（低于此值布局不可用） */
export const MIN_WINDOW_WIDTH = 720;
export const MIN_WINDOW_HEIGHT = 480;

/** 小屏幕安全呼吸比：高度最多占工作区 85%，宽度最多 95% */
export const MAX_WORK_AREA_RATIO = 0.85;
export const MAX_WORK_AREA_WIDTH_RATIO = 0.95;

/** 窗口坐标越界容差（逻辑像素 DIPs）：保证标题栏与顶部抓取区留在屏内 */
export const POSITION_TOLERANCE_X = 50;
export const POSITION_TOLERANCE_Y_TOP = 10;
export const POSITION_TOLERANCE_Y_BOTTOM = 50;

/** 更新窗口固定尺寸（不可缩放/最大化/最小化） */
export const UPDATER_WINDOW_WIDTH = 480;
export const UPDATER_WINDOW_HEIGHT = 460;
