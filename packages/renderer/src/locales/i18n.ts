import { SUPPORTED_LOCALES, type SupportedLocale } from '@app/shared/constants/preferences';
import { i18n } from '@lingui/core';
import type { Locale as AntdLocale } from 'antd/es/locale';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
// @ts-expect-error .po format is transformed by @lingui/vite-plugin at build time
import { messages as zhMessages } from './zh-CN/messages.po';

export { SUPPORTED_LOCALES, type SupportedLocale };

/**
 * 源语种（zh-CN）静态加载：React 首帧早于 AppProviders 的 useEffect，
 * 若首帧没有词条，t/msg 会抛「without setting a locale」或显示 hashed id。
 * zh-CN 是缺译回落语种，词条量很小，放进主 Bundle 换取首帧正确；
 * en 仍按 Vite chunk 动态加载，避免把全部语种打进主 Bundle。
 */
i18n.load('zh-CN', zhMessages);
i18n.activate('zh-CN');

const ANTD_LOCALES: Record<SupportedLocale, AntdLocale> = {
  'zh-CN': zhCN,
  en: enUS,
};

export function getAntdLocale(locale: SupportedLocale): AntdLocale {
  return ANTD_LOCALES[locale] ?? zhCN;
}

/**
 * 运行时切换语言：en 通过动态 import 按需加载 Chunk；zh-CN 已在模块初始化时静态加载。
 * en 缺译时 lingui 回落中文源文案，即 RM-13 的 fallback zh-CN。
 */
let activationSeq = 0;

export async function dynamicActivate(locale: SupportedLocale): Promise<void> {
  // 快速连续切换时，只允许最后一次选择落地，防止旧 import 后完成覆盖新语言
  const seq = ++activationSeq;

  if (locale === 'en') {
    // @ts-expect-error .po format is transformed by @lingui/vite-plugin at build time
    const { messages } = await import('./en/messages.po');
    if (seq !== activationSeq) return;
    i18n.load('en', messages);
  }

  i18n.activate(locale);

  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    document.documentElement.dir = 'ltr';
  }
}

export { i18n };
