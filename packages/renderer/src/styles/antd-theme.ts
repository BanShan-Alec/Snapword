import type { ThemeConfig } from 'antd';
import { claudeLightTheme, paseoDarkTheme } from 'paseo-antd-themes';
import { CSS_VAR_KEY, type ResolvedTheme } from './design-tokens';

/**
 * antd 主题配置（C-05）：浅色槽 = Claude Light，深色槽 = Paseo Dark。
 *
 * paseo 只做两件事：token 注入（ThemeConfig 的 algorithm 钉死调色板与形态 token）
 * 与 behavior 注入（PaseoThemeProvider 的组件级行为）；CSS 变量管线仍走 temp5 机制。
 * paseo 内置 ThemeConfig 不含 cssVar，故在槽位上补 cssVar.key——index.css 的
 * --ant-* → --color-* 语义别名依赖它（类由 applyColorScheme 挂到 <html>）。
 *
 * 不要在槽位上再叠 token：包的 algorithm 会剥掉 seed 覆盖层，改色走包的 extendTheme。
 */
function withCssVar(config: ThemeConfig): ThemeConfig {
  return { ...config, cssVar: { key: CSS_VAR_KEY } };
}

const THEME_SLOTS: Record<ResolvedTheme, ThemeConfig> = {
  light: withCssVar(claudeLightTheme),
  dark: withCssVar(paseoDarkTheme),
};

export function getAntdThemeConfig(mode: ResolvedTheme): ThemeConfig {
  return THEME_SLOTS[mode];
}
