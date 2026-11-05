import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { theme } from 'antd';
import { claudeLightTheme, paseoDarkTheme } from 'paseo-antd-themes';
import { describe, expect, it } from 'vitest';
import { getAntdThemeConfig } from '@/styles/antd-theme';
import { applyThemeVariables, getThemeVariables } from '@/styles/design-tokens';

/**
 * C-05 颜色链路：antd 组件主题（claudeLightTheme / paseoDarkTheme）与
 * Tailwind 桥接（--paseo-* 变量，来自 paseo-antd-themes/tailwind.css）必须同源。
 * 校验三段：ConfigProvider 槽位、tokens.css 窗口画布兜底值、包产物 CSS 变量。
 */

const readStyle = (name: string) =>
  fs.readFileSync(fileURLToPath(new URL(`../../src/styles/${name}`, import.meta.url)), 'utf8');

const readPaseoTailwindCss = () =>
  fs.readFileSync(
    fileURLToPath(
      new URL('../../node_modules/paseo-antd-themes/dist/tailwind.css', import.meta.url),
    ),
    'utf8',
  );

/** 大小写与空白归一，避免 #F0EDE2 / #f0ede2 之类的格式噪音 */
const norm = (value: string) => value.trim().toLowerCase();

const readVar = (block: string, name: string) =>
  new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim();

describe('antd 主题槽位（Claude Light / Paseo Dark）', () => {
  it('浅深两槽分别是包内 claudeLightTheme 与 paseoDarkTheme', () => {
    expect(getAntdThemeConfig('light')).toBe(claudeLightTheme);
    expect(getAntdThemeConfig('dark')).toBe(paseoDarkTheme);
  });

  it('两套主题颜色确实不同（浅奶油 / 深青绿）', () => {
    const light = theme.getDesignToken(claudeLightTheme);
    const dark = theme.getDesignToken(paseoDarkTheme);
    expect(norm(light.colorBgLayout)).not.toBe(norm(dark.colorBgLayout));
    expect(norm(light.colorText)).not.toBe(norm(dark.colorText));
  });

  it('形态与主题一致：14px 正文、40px 控件、12px 圆角', () => {
    for (const config of [claudeLightTheme, paseoDarkTheme]) {
      const tokens = theme.getDesignToken(config);
      expect(tokens.fontSize).toBe(14);
      expect(tokens.controlHeight).toBe(40);
      expect(tokens.borderRadius).toBe(12);
    }
  });
});

describe('tokens.css 窗口画布兜底值', () => {
  const tokensCss = readStyle('tokens.css');
  const darkStart = tokensCss.indexOf(':root[data-theme="dark"]');
  const blocks = [
    ['light', tokensCss.slice(0, darkStart), theme.getDesignToken(claudeLightTheme)],
    ['dark', tokensCss.slice(darkStart), theme.getDesignToken(paseoDarkTheme)],
  ] as const;

  it.each(blocks)('%s 画布值与主题 colorBgLayout / colorText 一致', (_, block, tokens) => {
    expect(norm(readVar(block, '--window-bg'))).toBe(norm(tokens.colorBgLayout));
    expect(norm(readVar(block, '--window-fg'))).toBe(norm(tokens.colorText));
  });
});

describe('Tailwind 桥接（paseo-antd-themes/tailwind.css）与 antd 主题同源', () => {
  const paseoCss = readPaseoTailwindCss();
  const lightStart = paseoCss.indexOf(':root, :host {');
  // 文件头注释里也出现 media 查询字样，从浅色块之后找真实块
  const mediaStart = paseoCss.indexOf('@media (prefers-color-scheme: dark)', lightStart);
  const classStart = paseoCss.indexOf('.dark {', mediaStart);
  const blocks = [
    ['light', paseoCss.slice(lightStart, mediaStart), theme.getDesignToken(claudeLightTheme)],
    ['dark', paseoCss.slice(classStart), theme.getDesignToken(paseoDarkTheme)],
  ] as const;

  it.each(blocks)('%s 的 --paseo-* 变量与 antd 派生 token 一致', (_, block, tokens) => {
    const cases = [
      ['--paseo-bg-layout', tokens.colorBgLayout],
      ['--paseo-bg-container', tokens.colorBgContainer],
      ['--paseo-text', tokens.colorText],
      ['--paseo-text-secondary', tokens.colorTextSecondary],
      ['--paseo-text-tertiary', tokens.colorTextTertiary],
      ['--paseo-primary', tokens.colorPrimary],
    ] as const;
    for (const [varName, tokenValue] of cases) {
      expect(norm(readVar(block, varName)), `${varName} 应与 antd token 一致`).toBe(
        norm(tokenValue),
      );
    }
  });

  it('index.css 引入桥接样式表且组件层使用 --paseo-* 变量', () => {
    const indexCss = readStyle('index.css');
    expect(indexCss).toContain('@import "paseo-antd-themes/tailwind.css"');
    expect(indexCss).toContain(
      'linear-gradient(to bottom, var(--paseo-bg-container), transparent)',
    );
    expect(indexCss).toContain('linear-gradient(to top, var(--paseo-bg-container), transparent)');
    // 类策略暗色变体保持机制契约（applyColorScheme 同步 .dark）
    expect(indexCss).toContain('@custom-variant dark');
  });
});

describe('显式主题模式（系统深色下手动浅色也必须生效）', () => {
  const paseoCss = readPaseoTailwindCss();
  const lightStart = paseoCss.indexOf(':root, :host {');
  const mediaStart = paseoCss.indexOf('@media (prefers-color-scheme: dark)', lightStart);
  const classStart = paseoCss.indexOf('.dark {', mediaStart);
  const blocks = [
    ['light', paseoCss.slice(lightStart, mediaStart)],
    ['dark', paseoCss.slice(classStart)],
  ] as const;

  const parseVars = (block: string) =>
    Object.fromEntries(
      [...block.matchAll(/--paseo-([a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [
        name,
        norm(value),
      ]),
    );

  it.each(blocks)('%s 模式的内联变量与包产物逐项一致', (mode, block) => {
    const expected = parseVars(block);
    const actual = getThemeVariables(mode);
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    for (const [name, value] of Object.entries(actual)) {
      expect(norm(value), `--paseo-${name}`).toBe(expected[name]);
    }
  });

  it('applyThemeVariables 把当前模式全部变量写到根元素（内联样式压过 media 块）', () => {
    const written = new Map<string, string>();
    applyThemeVariables(
      {
        style: {
          setProperty: (name, value) => {
            written.set(name, value);
          },
        },
      },
      'light',
    );
    const expected = getThemeVariables('light');
    expect(written.size).toBe(Object.keys(expected).length);
    expect(written.get('--paseo-bg-layout')).toBe(expected['bg-layout']);
    expect(written.get('--paseo-text')).toBe(expected.text);
    expect(written.get('--paseo-surface-sidebar')).toBe(expected['surface-sidebar']);
  });
});
