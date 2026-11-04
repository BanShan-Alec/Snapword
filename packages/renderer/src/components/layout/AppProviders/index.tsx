import { resolveLocale } from '@app/shared/constants/preferences';
import { I18nProvider } from '@lingui/react';
import { App as AntdApp, ConfigProvider } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import type React from 'react';
import { useEffect } from 'react';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { usePlatform } from '@/hooks/usePlatform';
import { useTheme } from '@/hooks/useTheme';
import { dynamicActivate, getAntdLocale, i18n } from '@/locales/i18n';
import { useAppStore } from '@/stores/useAppStore';
import { getAntdThemeConfig } from '@/styles/antd-theme';

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const languageMode = useAppStore((state) => state.language);
  // 'system' 在渲染层解析一次：navigator.language 反映 Chromium/OS 语言，无需额外 IPC
  const language = resolveLocale(languageMode, navigator.language);

  // 注入平台类名，供 CSS 做平台避让
  usePlatform();

  // 初始化并跟踪应用主题（设置 html 标签 data-theme 及 dark 类名）
  useTheme();

  // 国际化语言包按需动态激活
  useEffect(() => {
    dynamicActivate(language);
  }, [language]);

  // TODO(P5)：配置层（config.json + safeStorage）落地后在此拉取/同步主题与语言偏好

  return (
    <I18nProvider i18n={i18n}>
      {/*
        layer：把 cssinjs 注入的 antd 样式收进 @layer antd（层名由 cssinjs 默认提供），
        配合 index.css 首行的层序声明，使 Tailwind utilities 可直接覆盖 antd 组件样式。
      */}
      <StyleProvider layer>
        <ConfigProvider
          button={{ autoInsertSpace: false }}
          theme={getAntdThemeConfig(resolvedTheme)}
          locale={getAntdLocale(language)}
        >
          <AntdApp>
            <ErrorBoundary>{children}</ErrorBoundary>
          </AntdApp>
        </ConfigProvider>
      </StyleProvider>
    </I18nProvider>
  );
};
