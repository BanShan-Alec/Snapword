import type { ThemeConfig } from 'antd';
import { claudeLightTheme, paseoDarkTheme } from 'paseo-antd-themes';

/**
 * antd 主题配置（C-05）：浅色槽 = Claude Light，深色槽 = Paseo Dark。
 * 两套是 paseo-antd-themes 的完整 ThemeConfig（algorithm 钉死调色板 +
 * 形态 token：40/32/48 控件、12/8 圆角、14px 正文），不要在这里再叠 token ——
 * 包的 algorithm 会把 seed 覆盖层剥掉，改色走包的 extendTheme。
 * 槽位选择由 zustand resolvedTheme（system 解析结果）驱动，见 hooks/useTheme.ts。
 */

// 私有常量
const THEME_SLOTS: Record<'light' | 'dark', ThemeConfig> = {
  light: claudeLightTheme,
  dark: paseoDarkTheme,
};

export function getAntdThemeConfig(mode: 'light' | 'dark'): ThemeConfig {
  return THEME_SLOTS[mode];
}
