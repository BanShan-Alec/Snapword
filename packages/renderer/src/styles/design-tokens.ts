/**
 * 品牌色与主题模式入口。
 *
 * 颜色值由 antd cssVar 在 ConfigProvider 内生成（--ant-*），本文件只负责：
 * 1. BRAND_PRIMARY —— 唯一品牌种子；
 * 2. CSS_VAR_KEY —— cssVar 作用域类名，必须挂在 <html>；
 * 3. applyColorScheme —— 切 data-theme / 作用域类。
 *
 * 颜色链路见 DESIGN.md §3；不要在组件里读 getDesignToken 或写 CSS 变量。
 */

export type ResolvedTheme = 'light' | 'dark';

export const BRAND_PRIMARY = '#1677ff';

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
