import { StyleProvider } from '@ant-design/cssinjs';
import { resolveLocale } from '@app/shared/constants/preferences';
import { I18nProvider } from '@lingui/react';
import { App as AntdApp, ConfigProvider } from 'antd';
import type React from 'react';
import { useEffect, useState } from 'react';
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
  // zh-CN 已静态加载，可立即渲染；en 需等 chunk 就绪，避免英文用户先看到中文再闪切
  const [i18nReady, setI18nReady] = useState(language === 'zh-CN');

  // 注入平台类名，供 CSS 做平台避让
  usePlatform();

  // 初始化并跟踪应用主题（设置 html 标签 data-theme 及 dark 类名）
  useTheme();

  // 国际化语言包按需动态激活；失败时保留静态 zh-CN 作为回落，不让首屏空转
  useEffect(() => {
    let cancelled = false;
    dynamicActivate(language)
      .catch((error: unknown) => {
        logger.error('Failed to activate locale:', error);
      })
      .finally(() => {
        if (!cancelled) setI18nReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  // RM-13：语言切换立即同步主进程托盘菜单/通知文案，不重启
  useEffect(() => {
    const setLocale = window.api?.system?.setLocale;
    if (!setLocale) {
      return;
    }
    void setLocale(language).catch((error: unknown) => {
      logger.error('Failed to sync tray locale:', error);
    });
  }, [language]);

  // TODO(P5)：配置层（config.json + safeStorage）落地后在此拉取/同步主题与语言偏好

  if (!i18nReady) {
    return null;
  }

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
