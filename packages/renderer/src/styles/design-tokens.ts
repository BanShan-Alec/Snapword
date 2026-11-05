/**
 * 主题模式入口（C-05 已接入 paseo-antd-themes）。
 *
 * 颜色值来源：`paseo-antd-themes`（浅色槽 = Claude Light，深色槽 = Paseo Dark）。
 * - antd 组件：ConfigProvider 吃包内 `claudeLightTheme` / `paseoDarkTheme`（见 styles/antd-theme.ts）；
 * - 自绘标记：`paseo-antd-themes/tailwind.css` 提供的 `--paseo-*` CSS 变量（见 styles/index.css）；
 * 两处同源（包的生成器按同一 token 管线产出），单测校验一致性。
 *
 * 本文件负责 applyColorScheme —— 切 data-theme / .dark，并把当前模式的
 * `--paseo-*` 变量内联到 <html>：
 * 1. data-theme 驱动 tokens.css 的窗口画布（--window-*）与 color-scheme；
 * 2. .dark 驱动 Tailwind dark: 变体（类策略）；
 * 3. 内联变量压过包内 `@media (prefers-color-scheme: dark)`：系统深色 + 手动浅色时，
 *    media 块仍会命中 `:root` 并写入深色值，而 `.dark` 类并不存在，仅靠类无法回到浅色。
 *    内联样式优先级最高，两套主题的变量都来自同一个 getDesignToken 管线（与 ConfigProvider 同源）。
 * 不要在组件里读 getDesignToken 或手写 CSS 变量。
 */
import { claudeLightTheme, generateTailwindVariables, paseoDarkTheme } from 'paseo-antd-themes';

export type ResolvedTheme = 'light' | 'dark';

const VARIABLE_CACHE = new Map<ResolvedTheme, Record<string, string>>();

/** 当前模式 → --paseo-* 变量表（生成器与 antd 主题共用同一 token 管线） */
export function getThemeVariables(mode: ResolvedTheme): Record<string, string> {
  const cached = VARIABLE_CACHE.get(mode);
  if (cached) {
    return cached;
  }
  const variables = generateTailwindVariables(mode === 'light' ? claudeLightTheme : paseoDarkTheme);
  VARIABLE_CACHE.set(mode, variables);
  return variables;
}

export interface ThemeVariableTarget {
  style: { setProperty: (name: string, value: string) => void };
}

/** 把某一模式的 --paseo-* 变量写到目标根元素（内联，优先于包内 media 深色块） */
export function applyThemeVariables(root: ThemeVariableTarget, mode: ResolvedTheme): void {
  for (const [name, value] of Object.entries(getThemeVariables(mode))) {
    if (value != null) {
      root.style.setProperty(`--paseo-${name}`, String(value));
    }
  }
}

export function applyColorScheme(mode: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.toggle('dark', mode === 'dark');
  applyThemeVariables(root, mode);
}
