import path from 'node:path';
import type { Plugin } from 'vite';
import { normalizePath } from 'vite';

/**
 * 窗口标题构建期注入插件
 *
 * home / updater 两个 html 入口的 `<title>` 只写占位符 `__APP_TITLE__`，
 * dev 与 build 走同一 transformIndexHtml，用根 package.json 的 productName 替换。
 *
 * 事实链：productName → 构建期注入 document.title → Electron 加载后同步为窗口标题。
 * 不在运行时用 JS 改写标题，避免首帧前闪现占位符、以及脚本失败时标题永久错误。
 *
 * fail-fast：已知入口占位符缺失/重复、产品名为空即抛错——标题错误不会让应用崩溃，
 * 但会把错误文案带进任务栏、Alt+Tab 与 DevTools。
 */

// 私有常量
const TITLE_PLACEHOLDER = '__APP_TITLE__';

export interface AppTitlePluginOptions {
  /** renderer 包根目录（vite.config 里传 import.meta.dirname），用于定位入口 HTML */
  root: string;
  /** 应用显示名（根 package.json 的 productName） */
  appName: string;
}

/** 标题是 HTML 文本节点，转义产品名中的特殊字符（如模板使用者写成 "R&D"） */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function appTitlePlugin(options: AppTitlePluginOptions): Plugin {
  const { root, appName } = options;
  const title = appName.trim();
  if (!title) {
    throw new Error('[app-title] 根 package.json 缺少 productName，无法注入窗口标题');
  }

  const entryFiles = [
    path.resolve(root, 'src/entries/home/index.html'),
    path.resolve(root, 'src/entries/updater/index.html'),
  ].map((file) => normalizePath(file).toLowerCase());

  return {
    name: 'app-title',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // 入口隔离：仅两个应用窗口接标题占位符，其它 html 原样放行。
        // build 的 ctx.filename 经 normalizePath 为正斜杠，统一小写消除 Windows 大小写漂移
        const isAppEntry = entryFiles.includes((ctx.filename ?? '').toLowerCase());
        if (!isAppEntry) {
          return html;
        }

        const occurrences = html.split(TITLE_PLACEHOLDER).length - 1;
        if (occurrences !== 1) {
          throw new Error(
            `[app-title] ${ctx.filename} 中 ${TITLE_PLACEHOLDER} 应出现 1 次，实际 ${occurrences} 次`,
          );
        }

        // 用函数替换：产品名若含 $&/$' 等模式串，字符串替换会被特殊展开
        return html.replace(TITLE_PLACEHOLDER, () => escapeHtml(title));
      },
    },
  };
}
