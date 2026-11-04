import {
  DEFAULT_LANGUAGE,
  DEFAULT_THEME_MODE,
  type LanguageMode,
  LIGHT_COLOR_SCHEME_QUERY,
  type ThemeMode,
} from '@app/shared/constants/preferences';
import { create } from 'zustand';

/**
 * 全局轻量应用状态（对齐 renderer/hooks-and-state.md 第 2 章）。
 * 主题 mode 与解析后的 resolvedTheme 分层：'system' 依赖 OS 偏好，需在 UI 层解析为具体明暗。
 */

// 私有常量
export type { ThemeMode };
export type ResolvedTheme = 'light' | 'dark';

// 可抽离的逻辑处理函数/组件
function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== 'system') {
    return mode;
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia(LIGHT_COLOR_SCHEME_QUERY).matches ? 'light' : 'dark';
  }
  return 'dark';
}

interface AppState {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setThemeMode: (mode: ThemeMode) => void;
  language: LanguageMode;
  setLanguage: (language: LanguageMode) => void;
}

export const useAppStore = create<AppState>((set) => ({
  themeMode: DEFAULT_THEME_MODE,
  resolvedTheme: resolveTheme(DEFAULT_THEME_MODE),
  setThemeMode: (themeMode) => set({ themeMode, resolvedTheme: resolveTheme(themeMode) }),
  language: DEFAULT_LANGUAGE,
  setLanguage: (language) => set({ language }),
}));
