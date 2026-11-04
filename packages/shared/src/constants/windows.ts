export const WINDOW_IDS = {
  /** 主窗口：翻译 / 历史 / 生词本 / 术语表 / 设置 / 帮助（B-01 §10.2） */
  HOME: 'home',
} as const;

export type WindowId = (typeof WINDOW_IDS)[keyof typeof WINDOW_IDS];
