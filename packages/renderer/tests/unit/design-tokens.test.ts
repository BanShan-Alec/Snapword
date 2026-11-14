import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAntdThemeConfig } from '@/styles/antd-theme';
import { CSS_VAR_KEY } from '@/styles/design-tokens';

const tokensCss = readFileSync(
  fileURLToPath(new URL('../../src/styles/tokens.css', import.meta.url)),
  'utf8',
);

/** tokens.css 里按出现顺序取 --window-* 值：第一段 :root 为浅色，第二段 [data-theme="dark"] 为深色 */
function windowVar(name: '--window-bg' | '--window-fg', mode: 'light' | 'dark'): string {
  const matches = [...tokensCss.matchAll(new RegExp(`${name}:\\s*([^;]+);`, 'g'))].map((m) =>
    m[1].trim(),
  );
  expect(matches.length).toBe(2);
  return mode === 'light' ? matches[0] : matches[1];
}

describe('paseo 主题链（temp5 机制 + paseo token/behavior 注入）', () => {
  it('两套槽位来自 paseo，且都注入同一个 cssVar key', () => {
    for (const mode of ['light', 'dark'] as const) {
      const config = getAntdThemeConfig(mode);
      expect(config.cssVar).toEqual({ key: CSS_VAR_KEY });
      expect(config.token?.colorBgLayout).toBeTruthy();
    }
    expect(getAntdThemeConfig('light')).not.toBe(getAntdThemeConfig('dark'));
  });

  it('tokens.css 的窗口画布与槽位 token 同源（colorBgLayout / colorText）', () => {
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

  it('滚动条令牌两套主题都有定义', () => {
    expect(tokensCss.match(/--color-scrollbar-thumb:/g)?.length).toBe(2);
    expect(tokensCss.match(/--color-scrollbar-thumb-hover:/g)?.length).toBe(2);
    expect(tokensCss.match(/--color-scrollbar-thumb-active:/g)?.length).toBe(2);
  });
});
