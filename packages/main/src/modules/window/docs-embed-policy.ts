import { PROJECT_DOCS_URL } from '@app/shared/constants/docs';

export const DOCS_EMBED_STYLE_ID = 'docs-embed-style';

/**
 * 隐藏文档站自带的主题切换器（侧栏底部 + 移动端导航）。
 *
 * 双选择器：`aria-label` 是语义入口，`data-v-sidebar-footer-content` 是 Vocs 侧栏结构兜底。
 * 注意：这是对 Vocs 内部 DOM 的隐式耦合，升级 vocs 后需手工回归一次。
 */
export const DOCS_EMBED_STYLE =
  '[aria-label="Theme selection"],[data-v-sidebar-footer-content] [role="radiogroup"]{display:none!important}';

/** 只匹配项目文档站及其子路径，避免误伤同账号下其他 GitHub Pages 项目。 */
export function isDocsFrameUrl(url: string): boolean {
  return url.startsWith(PROJECT_DOCS_URL);
}
