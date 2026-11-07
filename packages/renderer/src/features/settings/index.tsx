import type { LanguageMode } from '@app/shared/constants/preferences';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Card, Segmented } from 'antd';
import { type ThemeMode, useAppStore } from '@/stores/useAppStore';

/**
 * 设置域占位（C-05 最小形态）：主题与界面语言真实生效（RC-16 / RM-13），
 * 当前选择存 zustand 占位 store，P5 配置层（config.json + safeStorage）落地后
 * 迁移到 setting 表并持久化。其余设置分组（API / 取词 / 卡片 / 数据 / 系统 / 朗读）
 * 随配置层接入。
 */
export const SettingsFeature = () => {
  useLingui();
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const language = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);

  const themeOptions: Array<{ label: string; value: ThemeMode }> = [
    { label: t`跟随系统`, value: 'system' },
    { label: t`浅色`, value: 'light' },
    { label: t`深色`, value: 'dark' },
  ];

  const languageOptions: Array<{ label: string; value: LanguageMode }> = [
    { label: t`跟随系统`, value: 'system' },
    { label: t`中文`, value: 'zh-CN' },
    { label: t`English`, value: 'en' },
  ];

  return (
    <section className="app-page flex h-full flex-col gap-4">
      <header>
        <h1 className="text-heading-sm font-semibold text-text">{t`设置`}</h1>
        <p className="mt-1 text-body text-text-secondary">
          {t`当前设置仅本次运行有效，后续版本将自动保存。`}
        </p>
      </header>
      <Card title={t`外观`}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-body">{t`主题`}</div>
            <div className="mt-1 text-caption text-text-tertiary">{t`浅色、深色或跟随系统。`}</div>
          </div>
          <Segmented
            value={themeMode}
            onChange={(value) => setThemeMode(value as ThemeMode)}
            options={themeOptions}
          />
        </div>
      </Card>
      <Card title={t`语言`}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-body">{t`界面语言`}</div>
            <div className="mt-1 text-caption text-text-tertiary">
              {t`默认跟随系统，切换后立即生效。`}
            </div>
          </div>
          <Segmented
            value={language}
            onChange={(value) => setLanguage(value as LanguageMode)}
            options={languageOptions}
          />
        </div>
      </Card>
    </section>
  );
};
