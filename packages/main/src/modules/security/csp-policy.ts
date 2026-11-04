export interface CspPolicyOptions {
  isDev: boolean;
  apiOrigin: string | null;
  /** 允许 iframe 嵌入的站点 origin；当前为 null（省略 frame-src），后续接入外部页面时登记 */
  docsOrigin: string | null;
}

/**
 * 构建 Content-Security-Policy。
 *
 * 开发态放宽以支持 Vite/HMR；生产态收紧。
 * 若配置 docsOrigin 则显式放行 frame-src：`default-src 'self'` 会拦掉跨源 iframe。
 */
export function buildCspPolicy({ isDev, apiOrigin, docsOrigin }: CspPolicyOptions): string {
  const connectSrc = apiOrigin ? `'self' ${apiOrigin}` : "'self'";

  if (isDev) {
    return "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: http: ws:;";
  }

  const frameSrc = docsOrigin ? ` frame-src ${docsOrigin};` : '';
  return `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src ${connectSrc};${frameSrc}`;
}

/**
 * CSP 是文档级策略，只注入主框架。
 *
 * 若注入到子框架，依赖 `unsafe-eval` 的子页面会被套上应用的 `script-src` 后整页空白。
 */
export function shouldInjectCsp(resourceType: string | undefined): boolean {
  return resourceType === 'mainFrame';
}
