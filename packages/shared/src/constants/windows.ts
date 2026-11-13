export const WINDOW_IDS = {
  /** 原主窗口（更名定义）：dashboard / architecture 两个 tab 的宿主 */
  HOME: 'home',
  /** 自动更新窗口：changelog + 进度 + 操作 */
  UPDATER: 'updater',
} as const;

export type WindowId = (typeof WINDOW_IDS)[keyof typeof WINDOW_IDS];

/**
 * 首帧主题键：窗口创建链把解析结果（'light' | 'dark'）经 URL query 传给 renderer，
 * 入口内联脚本消费它预置 data-theme。见 window 模块的 resolveNativeTheme。
 */
export const STARTUP_THEME_QUERY_KEY = 'theme';
