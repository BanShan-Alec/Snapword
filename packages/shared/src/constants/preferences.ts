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

/** 实际拥有 catalog 的语种（与 lingui.config.ts 的 locales 保持一致） */
export const SUPPORTED_LOCALES = ['zh-CN', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** 缺译时的回落语种（也是 lingui 的 sourceLocale） */
export const FALLBACK_LOCALE: SupportedLocale = 'zh-CN';

/** 界面语言偏好：'system' 跟随操作系统，其余为具体语种 */
export const LANGUAGE_MODES = ['system', ...SUPPORTED_LOCALES] as const;
export type LanguageMode = (typeof LANGUAGE_MODES)[number];

/** 默认语言偏好：跟随系统（RM-13） */
export const DEFAULT_LANGUAGE: LanguageMode = 'system';

/**
 * 把语言偏好解析成实际加载的 catalog 语种。
 * 只保留中英两套词条：中文系（zh-*）落到 zh-CN，英文系（en-*）落到 en；
 * 其它无法识别的系统语言按 FR-49 回落 FALLBACK_LOCALE（zh-CN）。
 */
export function resolveLocale(mode: LanguageMode, systemLocale: string): SupportedLocale {
  if (mode !== 'system') {
    return mode;
  }
  const normalized = systemLocale.toLowerCase();
  if (normalized.startsWith('zh')) {
    return 'zh-CN';
  }
  if (normalized.startsWith('en')) {
    return 'en';
  }
  return FALLBACK_LOCALE;
}
