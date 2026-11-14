import { LIGHT_COLOR_SCHEME_QUERY } from '@app/shared/constants/preferences';
import { useEffect } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { applyColorScheme } from '@/styles/design-tokens';

/**
 * 应用级主题联动（跨 feature 的壳层职责，故置于 hooks/ 而非任一域）：
 * 1. applyColorScheme 同步 data-theme 与 cssVar 作用域类；antd 算法由 ConfigProvider 随 resolvedTheme 切换；
 * 2. themeMode 为 'system' 时跟随 OS 偏好变化（监听必须配套清理，防止泄漏与重复触发）。
 */

// 可抽离的逻辑处理函数/组件
export function useTheme() {
  const themeMode = useAppStore((state) => state.themeMode);
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const setThemeMode = useAppStore((state) => state.setThemeMode);

  // 组件Effect
  useEffect(() => {
    applyColorScheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (themeMode !== 'system') {
      return;
    }
    const mediaQuery = window.matchMedia(LIGHT_COLOR_SCHEME_QUERY);
    const handleChange = () => {
      setThemeMode('system');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [themeMode, setThemeMode]);
}
