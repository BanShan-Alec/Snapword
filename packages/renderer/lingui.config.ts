import type { LinguiConfig } from '@lingui/conf';
import { formatter } from '@lingui/format-po';

const config: LinguiConfig = {
  // 仅中英双语；locale 码用 'en'（非 en-US），与 @app/shared 的 SUPPORTED_LOCALES 对齐
  locales: ['zh-CN', 'en'],
  sourceLocale: 'zh-CN',
  // en 有缺译时回落中文源文案，避免英文界面出现空串
  fallbackLocales: { default: 'zh-CN' },
  catalogs: [
    {
      path: '<rootDir>/src/locales/{locale}/messages',
      include: ['src'],
    },
  ],
  format: formatter({ lineNumbers: false }),
};

export default config;
