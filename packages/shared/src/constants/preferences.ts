/**
 * 应用偏好契约（主题 / 语言枚举与默认值单一事实源）
 *
 * 同时服务：Zod 配置 schema、主进程 ConfigStore 默认值、渲染进程 store、
 * 设置界面选项与 i18n 引导。新增语言/主题只改这里。
 */

export const THEME_MODES = ['system', 'light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const DEFAULT_THEME_MODE: ThemeMode = 'system';

/** 解析 'system' 时使用的 OS 明暗偏好媒体查询 */
export const LIGHT_COLOR_SCHEME_QUERY = '(prefers-color-scheme: light)';

/** 实际拥有 catalog 的语种 */
export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** 界面语言偏好：'system' 跟随操作系统，其余为具体语种 */
export const LANGUAGE_MODES = ['system', ...SUPPORTED_LOCALES] as const;
export type LanguageMode = (typeof LANGUAGE_MODES)[number];

/** 默认语言偏好（中文优先；选 'system' 才跟随 OS） */
export const DEFAULT_LANGUAGE: LanguageMode = 'zh-CN';

/**
 * 把语言偏好解析成实际加载的 catalog 语种。
 * 只保留中英两套词条：中文系（zh-*）落到 zh-CN，其余系统语言落到 en-US；
 * 拿不到系统语言时回落默认值，避免设置页与主进程出现空态。
 */
export function resolveLocale(mode: LanguageMode, systemLocale: string): SupportedLocale {
  if (mode !== 'system') {
    return mode;
  }
  const normalized = systemLocale.toLowerCase();
  if (!normalized) {
    return 'zh-CN';
  }
  return normalized.startsWith('zh') ? 'zh-CN' : 'en-US';
}
