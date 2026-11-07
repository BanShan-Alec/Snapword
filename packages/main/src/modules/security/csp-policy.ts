export interface CspPolicyOptions {
  isDev: boolean;
  apiOrigin: string | null;
}

/**
 * 构建 Content-Security-Policy。
 */
export function buildCspPolicy({ isDev, apiOrigin }: CspPolicyOptions): string {
  const connectSrc = apiOrigin ? `'self' ${apiOrigin}` : "'self'";

  if (isDev) {
    return "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: http: ws:;";
  }

  return `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src ${connectSrc};`;
}

/**
 * CSP 是文档级策略，只注入主框架。
 *
 * 子框架不注入应用的 `script-src`（无 `unsafe-eval`）等策略，
 * 避免第三方页面被套上后运行时抛 EvalError 整页空白。
 */
export function shouldInjectCsp(resourceType: string | undefined): boolean {
  return resourceType === 'mainFrame';
}
