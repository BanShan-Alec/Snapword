export interface CspPolicyOptions {
  isDev: boolean;
  apiOrigin: string | null;
  docsOrigin: string;
}

/**
 * 构建 Content-Security-Policy。
 *
 * 生产环境必须显式放行文档站 origin 的 frame-src：`default-src 'self'` 会拦掉跨源 iframe。
 */
export function buildCspPolicy({ isDev, apiOrigin, docsOrigin }: CspPolicyOptions): string {
  const connectSrc = apiOrigin ? `'self' ${apiOrigin}` : "'self'";

  if (isDev) {
    return "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: http: ws:;";
  }

  return `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src ${connectSrc}; frame-src ${docsOrigin};`;
}

/**
 * CSP 是文档级策略，只注入主框架。
 *
 * 若注入到子框架，文档站（Waku/Vocs）会被套上应用的 `script-src`（无 `unsafe-eval`），
 * 运行时抛 EvalError 后整页空白。
 */
export function shouldInjectCsp(resourceType: string | undefined): boolean {
  return resourceType === 'mainFrame';
}
