import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAntdThemeConfig } from '@/styles/antd-theme';
import { getThemeVariables } from '@/styles/design-tokens';

const tokensCss = readFileSync(
  fileURLToPath(new URL('../../src/styles/tokens.css', import.meta.url)),
  'utf8',
);

/** tokens.css 里按出现顺序取 --window-* 值：第一段 :root 为浅色，第二段 [data-theme="dark"] 为深色 */
function windowVar(name: '--window-bg' | '--window-fg', mode: 'light' | 'dark'): string {
  const matches = [...tokensCss.matchAll(new RegExp(`${name}:s*([^;]+);`, 'g'))].map((m) =>
    m[1].trim(),
  );
  expect(matches.length).toBe(2);
  return mode === 'light' ? matches[0] : matches[1];
}

describe('paseo 主题链一致性（C-05）', () => {
  it('antd 槽位来自 paseo-antd-themes 的两套完整 ThemeConfig', () => {
    expect(() => getAntdThemeConfig('light')).not.toThrow();
    expect(() => getAntdThemeConfig('dark')).not.toThrow();
    expect(getAntdThemeConfig('light')).not.toBe(getAntdThemeConfig('dark'));
  });

  it('tokens.css 窗口画布与主题 token 同源（colorBgLayout / colorText）', () => {
    for (const mode of ['light', 'dark'] as const) {
      const theme = getAntdThemeConfig(mode);
      expect(theme.token?.colorBgLayout?.toLowerCase()).toBe(
        windowVar('--window-bg', mode).toLowerCase(),
      );
      expect(theme.token?.colorText?.toLowerCase()).toBe(
        windowVar('--window-fg', mode).toLowerCase(),
      );
    }
  });

  it('getThemeVariables 为每个模式生成 --paseo-* 变量表并按模式缓存', () => {
    const light = getThemeVariables('light');
    const dark = getThemeVariables('dark');
    expect(Object.keys(light).length).toBeGreaterThan(0);
    expect(light).not.toEqual(dark);
    expect(getThemeVariables('light')).toBe(light);
    expect(getThemeVariables('dark')).toBe(dark);
  });

  it('滚动条令牌两套主题都有定义', () => {
    expect(tokensCss.match(/--color-scrollbar-thumb:/g)?.length).toBe(2);
    expect(tokensCss.match(/--color-scrollbar-thumb-hover:/g)?.length).toBe(2);
    expect(tokensCss.match(/--color-scrollbar-thumb-active:/g)?.length).toBe(2);
  });
});
