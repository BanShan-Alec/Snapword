/**
 * WCAG 2.1 对比度实测（docs/PRD-v2.md RC-16：文字 ≥4.5:1，图标 ≥3:1）。
 *
 * 数据源：packages/renderer/node_modules/paseo-antd-themes/dist/tailwind.css
 * —— 包发布产物，浅色槽（Claude Light）= :root，深色槽（Paseo Dark）= .dark 块，
 * 与 ConfigProvider 里两套 ThemeConfig 同一条 token 管线（renderer 单测校验同源）。
 *
 * 运行：node scripts/contrast-check.mjs
 * 输出：Markdown 表（粘贴进 packages/renderer/docs/DESIGN.md）；正文/次要档低于 4.5:1 时退出码 1。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = path.join(
  repoRoot,
  'packages/renderer/node_modules/paseo-antd-themes/dist/tailwind.css',
);

// 私有常量：档位 → WCAG 门槛（RC-16 文字 4.5 / 图形 3；三级在侧栏等浮层面对应包规则 4.0）。
// gate=false 的组合是「按规则禁用」的知情记录：深色下 primary 本体是填充色，
// 前景/图形必须用 primary-text 族（与 link 同值），否则低于 3:1（见 packages/renderer/docs/DESIGN.md）。
const COMBOS = [
  { role: '正文', fg: 'text', bg: 'bg-layout', surface: '页面底', min: 4.5, gate: true },
  { role: '正文', fg: 'text', bg: 'bg-container', surface: '容器', min: 4.5, gate: true },
  { role: '正文', fg: 'text', bg: 'surface-sidebar', surface: '侧栏', min: 4.5, gate: true },
  { role: '次要', fg: 'text-secondary', bg: 'bg-layout', surface: '页面底', min: 4.5, gate: true },
  { role: '次要', fg: 'text-secondary', bg: 'bg-container', surface: '容器', min: 4.5, gate: true },
  {
    role: '次要',
    fg: 'text-secondary',
    bg: 'surface-sidebar',
    surface: '侧栏',
    min: 4.5,
    gate: true,
  },
  {
    role: '三级（元信息）',
    fg: 'text-tertiary',
    bg: 'bg-layout',
    surface: '页面底',
    min: 4.5,
    gate: true,
  },
  {
    role: '三级（元信息）',
    fg: 'text-tertiary',
    bg: 'bg-container',
    surface: '容器',
    min: 4.5,
    gate: true,
  },
  {
    role: '三级（元信息）',
    fg: 'text-tertiary',
    bg: 'surface-sidebar',
    surface: '侧栏',
    min: 4.0,
    gate: true,
  },
  {
    role: '图标 · 主色文字（= link）',
    fg: 'primary-text',
    bg: 'bg-container',
    surface: '容器',
    min: 3.0,
    gate: true,
  },
  {
    role: '图标 · primary 本体（禁用）',
    fg: 'primary',
    bg: 'bg-container',
    surface: '容器',
    min: 3.0,
    gate: false,
  },
  {
    role: '主按钮文字',
    fg: 'text-light-solid',
    bg: 'primary',
    surface: '主色底',
    min: 4.5,
    gate: true,
  },
];

// 可抽离的逻辑处理函数/组件
function parseVars(block) {
  const vars = {};
  for (const match of block.matchAll(/--paseo-([a-z0-9-]+):\s*([^;]+);/g)) {
    vars[match[1]] = match[2].trim();
  }
  return vars;
}

function parseSchemeBlocks(css) {
  // :root 浅色块；.dark 深色块（与 media 块同值，单测已证，取类块便于定位）
  const lightStart = css.indexOf(':root, :host {');
  const darkStart = css.indexOf('.dark {', lightStart);
  if (lightStart < 0 || darkStart < 0) {
    throw new Error('tailwind.css 缺少 :root 或 .dark 变量块，产物结构已变化');
  }
  return {
    light: parseVars(css.slice(lightStart, css.indexOf('}', lightStart))),
    dark: parseVars(css.slice(darkStart, css.indexOf('}', darkStart))),
  };
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3 ? [...normalized].map((ch) => ch + ch).join('') : normalized;
  return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16));
}

/** WCAG 2.1 相对亮度（sRGB 线性化） */
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fgHex, bgHex) {
  const [hi, lo] = [luminance(fgHex), luminance(bgHex)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const round2 = (value) => value.toFixed(2);

// 主流程：解析两套变量 → 逐组合计算 → 打表 → 按档位门槛决定退出码
const css = readFileSync(cssPath, 'utf8');
const schemes = parseSchemeBlocks(css);
const failures = [];
const rows = [
  '| 主题 | 档位 | 前景（--paseo-*） | 背景 | 实测 | 门槛 | 判定 |',
  '| --- | --- | --- | --- | --- | --- | --- |',
];

for (const [schemeName, vars] of Object.entries(schemes)) {
  for (const { role, fg, bg, surface, min, gate } of COMBOS) {
    const fgValue = vars[fg];
    const bgValue = vars[bg];
    if (!fgValue || !bgValue) {
      throw new Error(`${schemeName} 缺少变量 --paseo-${fg} 或 --paseo-${bg}`);
    }
    if (!/^#[0-9a-f]{3,6}$/i.test(fgValue) || !/^#[0-9a-f]{3,6}$/i.test(bgValue)) {
      // rgba（遮罩/选区类）不参与本表；出现即先合成到底色再算，见 README 的说明
      throw new Error(`${schemeName} ${fg}/${bg} 含非 hex 值：${fgValue} / ${bgValue}`);
    }
    const ratio = contrastRatio(fgValue, bgValue);
    const pass = ratio >= min;
    if (!pass && gate) {
      failures.push(`${schemeName} ${role} on ${surface}: ${round2(ratio)} < ${min}`);
    }
    const verdict = pass ? '通过' : gate ? '❌ 不达标' : '按规则禁用（改用 primary-text）';
    rows.push(
      `| ${schemeName} | ${role} | ${fg} \`${fgValue}\` | ${surface}（${bg} \`${bgValue}\`） | **${round2(ratio)}:1** | ≥${min}:1 | ${verdict} |`,
    );
  }
}

console.log(rows.join('\n'));
if (failures.length > 0) {
  console.error(`\n${failures.length} 项低于门槛：\n${failures.join('\n')}`);
  process.exit(1);
}
console.error('\n全部组合达到门槛。');
