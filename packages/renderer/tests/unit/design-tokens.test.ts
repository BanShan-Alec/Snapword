import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs';
import { Button, ConfigProvider } from 'antd';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getAntdThemeConfig } from '@/styles/antd-theme';
import { BRAND_PRIMARY, CSS_VAR_KEY } from '@/styles/design-tokens';

const readStyle = (name: string) =>
  fs.readFileSync(fileURLToPath(new URL(`../../src/styles/${name}`, import.meta.url)), 'utf8');

function extractThemeCss(mode: 'light' | 'dark'): string {
  const cache = createCache();
  renderToString(
    React.createElement(
      StyleProvider,
      { cache },
      React.createElement(
        ConfigProvider,
        { theme: getAntdThemeConfig(mode) },
        React.createElement(Button, { type: 'primary' }, 'OK'),
      ),
    ),
  );
  return extractStyle(cache);
}

const lightCss = extractThemeCss('light');
const darkCss = extractThemeCss('dark');
const indexCss = readStyle('index.css');

describe('cssVar 颜色链路', () => {
  it('antd 主题与作用域类共用同一个 key 与品牌种子', () => {
    for (const mode of ['light', 'dark'] as const) {
      const config = getAntdThemeConfig(mode);
      expect(config.cssVar.key).toBe(CSS_VAR_KEY);
      expect(config.token.colorPrimary).toBe(BRAND_PRIMARY);
    }
  });

  it('antd 在 .css-var-app 作用域注入项目引用的每个 --ant-* 变量', () => {
    const targets = new Set(
      [...indexCss.matchAll(/--color-[a-z-]+:\s*var\((--ant-[a-z-]+)\)/g)].map((match) => match[1]),
    );

    expect(targets.size).toBeGreaterThan(0);
    expect(lightCss).toContain(`.${CSS_VAR_KEY}{`);
    expect(darkCss).toContain(`.${CSS_VAR_KEY}{`);

    for (const target of targets) {
      expect(lightCss, `light 缺少 ${target}`).toContain(`${target}:`);
      expect(darkCss, `dark 缺少 ${target}`).toContain(`${target}:`);
    }
    expect(lightCss).toContain('--ant-color-error:');
  });

  it('浅深两套颜色不同', () => {
    expect(darkCss).not.toBe(lightCss);
    expect(lightCss).toContain('--ant-color-bg-layout:');
    expect(darkCss).toContain('--ant-color-bg-layout:');
  });

  it('USB 渐隐使用主题表面色', () => {
    expect(indexCss).toContain(
      'linear-gradient(to bottom, var(--color-bg-container), transparent)',
    );
    expect(indexCss).toContain('linear-gradient(to top, var(--color-bg-container), transparent)');
  });
});
