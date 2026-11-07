import { theme } from 'antd';
import { BRAND_PRIMARY, CSS_VAR_KEY, type ResolvedTheme } from './design-tokens';

/**
 * antd 主题配置：官方算法 + 一个品牌种子 + cssVar 作用域。
 * cssVar.key 会被 antd 原样用作类名；applyColorScheme 负责把它挂到 <html>。
 * controlHeightSM=28 是刻意的密度选择（antd 默认 24）。
 */

export function getAntdThemeConfig(mode: ResolvedTheme) {
  return {
    algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
    cssVar: { key: CSS_VAR_KEY },
    token: {
      colorPrimary: BRAND_PRIMARY,
      controlHeightSM: 28,
    },
  };
}
