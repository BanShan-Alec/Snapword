/**
 * 主题模式入口（temp5 机制）：data-theme + antd cssVar 作用域类。
 *
 * 调色板不在本文件：浅色槽 = Claude Light、深色槽 = Paseo Dark，由
 * paseo-antd-themes 的 ThemeConfig 经 PaseoThemeProvider 注入（见 styles/antd-theme.ts）；
 * 颜色实体以 --ant-* CSS 变量生成在 `.css-var-app` 作用域（index.css 再改名为 --color-*）。
 * 本文件只负责切 data-theme 与挂作用域类；不要在组件里读 getDesignToken 或手写颜色。
 */

export type ResolvedTheme = 'light' | 'dark';

/**
 * cssVar.key 会被 antd 原样用作类名（不是前缀）。
 * 类必须挂在 <html>：index.css 的 :root 语义别名要能解析 --ant-*。
 */
export const CSS_VAR_KEY = 'css-var-app';

export function applyColorScheme(mode: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.add(CSS_VAR_KEY);
}
