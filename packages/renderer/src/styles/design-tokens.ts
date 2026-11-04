/**
 * 主题模式入口（C-05 已接入 paseo-antd-themes）。
 *
 * 颜色值来源：`paseo-antd-themes`（浅色槽 = Claude Light，深色槽 = Paseo Dark）。
 * - antd 组件：ConfigProvider 吃包内 `claudeLightTheme` / `paseoDarkTheme`（见 styles/antd-theme.ts）；
 * - 自绘标记：`paseo-antd-themes/tailwind.css` 提供的 `--paseo-*` CSS 变量（见 styles/index.css）；
 * 两处同源（包的生成器按同一 token 管线产出），单测校验一致性。
 *
 * 本文件只负责 applyColorScheme —— 切 data-theme / .dark：
 * 1. data-theme 驱动 tokens.css 的窗口画布（--window-*）与 color-scheme；
 * 2. .dark 驱动 --paseo-* 变量表与 Tailwind dark: 变体（类策略）。
 * 不要在组件里读 getDesignToken 或手写 CSS 变量。
 */

export type ResolvedTheme = 'light' | 'dark';

export function applyColorScheme(mode: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.toggle('dark', mode === 'dark');
}
