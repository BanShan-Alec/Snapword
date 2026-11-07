import { type WebContents, webFrameMain } from 'electron';
import { getLogManager } from '../log.module';
import { DOCS_EMBED_STYLE, DOCS_EMBED_STYLE_ID, isDocsFrameUrl } from './docs-embed-policy';

const INJECT_SCRIPT = `(() => {
  if (document.getElementById(${JSON.stringify(DOCS_EMBED_STYLE_ID)})) return 'exists';
  const style = document.createElement('style');
  style.id = ${JSON.stringify(DOCS_EMBED_STYLE_ID)};
  style.textContent = ${JSON.stringify(DOCS_EMBED_STYLE)};
  document.head.appendChild(style);
  return 'injected';
})()`;

/**
 * 在 home 窗口的文档站子框架加载完成后注入固定样式，隐藏其主题切换器。
 *
 * 不修改文档站源码；只匹配项目文档站 URL，注入内容为固定字符串。
 * 客户端路由跳转不会丢样式；整页刷新会重新触发 did-frame-finish-load，自动重注入。
 */
export function attachDocsEmbedStyle(contents: WebContents): void {
  const logger = getLogManager().scoped('DocsEmbed');

  contents.on('did-frame-finish-load', (_event, isMainFrame, frameProcessId, frameRoutingId) => {
    if (isMainFrame) return;

    const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
    if (!frame || !isDocsFrameUrl(frame.url)) return;

    void frame
      .executeJavaScript(INJECT_SCRIPT)
      .then((result: unknown) => {
        if (result === 'injected') {
          logger.info('Docs embed style injected');
          return;
        }
        logger.debug('Docs embed style already exists');
      })
      .catch((error: unknown) => logger.warn('Failed to inject docs embed style', error));
  });
}
