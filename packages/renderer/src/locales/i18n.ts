import { SUPPORTED_LOCALES, type SupportedLocale } from '@app/shared/constants/preferences';
import { i18n } from '@lingui/core';
import type { Locale as AntdLocale } from 'antd/es/locale';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';

export { SUPPORTED_LOCALES, type SupportedLocale };

const ANTD_LOCALES: Record<SupportedLocale, AntdLocale> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

export function getAntdLocale(locale: SupportedLocale): AntdLocale {
  return ANTD_LOCALES[locale] ?? zhCN;
}

/**
 * 运行时通过动态 import 按需加载语言包 Chunk，避免所有语种打包进主 Bundle
 */
export async function dynamicActivate(locale: SupportedLocale): Promise<void> {
  if (locale === 'en-US') {
    // @ts-expect-error .po format is transformed by @lingui/vite-plugin at build time
    const { messages } = await import('./en-US/messages.po');
    i18n.load('en-US', messages);
  } else {
    // @ts-expect-error .po format is transformed by @lingui/vite-plugin at build time
    const { messages } = await import('./zh-CN/messages.po');
    i18n.load('zh-CN', messages);
  }

  i18n.activate(locale);

  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

export { i18n };
