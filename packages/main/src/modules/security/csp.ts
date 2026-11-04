import { session } from 'electron';
import type { AppModule } from '../../AppModule';
import type { ModuleContext } from '../../ModuleContext';
import { getLogManager } from '../log.module';
import { buildCspPolicy, shouldInjectCsp } from './csp-policy';

/**
 * CSP 安全模块：
 * 统一拦截 session 请求响应头，注入 Content-Security-Policy，
 * 解决渲染进程安全告警 (Insecure Content-Security-Policy)，同时兼容开发调试环境 (Vite/HMR)。
 * 翻译 API 直连由主进程发起（B-01 §3），渲染层无需 connect-src 放行 API origin。
 */
export class ContentSecurityPolicyModule implements AppModule {
  private readonly logger = getLogManager().scoped('ContentSecurityPolicy');

  enable({ app }: ModuleContext): Promise<void> | void {
    app.on('ready', () => {
      this.setupCSP();
    });
  }

  private setupCSP(): void {
    const defaultSession = session.defaultSession;
    if (!defaultSession) {
      this.logger.warn('defaultSession is not available to configure CSP.');
      return;
    }

    const isDev = !import.meta.env.PROD;

    // P4 骨架无文档站 iframe 与渲染层 API 直连，均为 null；接入时在此登记
    const cspPolicy = buildCspPolicy({ isDev, apiOrigin: null, docsOrigin: null });

    defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders };

      // CSP 是文档级策略：只注入主框架。子框架不能被套上应用 CSP，
      // 其运行时依赖 eval，套上后会 EvalError 白屏
      if (!shouldInjectCsp(details.resourceType)) {
        callback({ responseHeaders });
        return;
      }

      // 检查响应中是否已存在 CSP 头（大小写不敏感匹配）
      const existingKey = Object.keys(responseHeaders).find(
        (key) => key.toLowerCase() === 'content-security-policy',
      );

      if (existingKey) {
        const existingVal = responseHeaders[existingKey];
        const existingArray = Array.isArray(existingVal) ? existingVal : [existingVal];
        responseHeaders[existingKey] = [...existingArray, cspPolicy];
      } else {
        responseHeaders['Content-Security-Policy'] = [cspPolicy];
      }

      callback({ responseHeaders });
    });

    this.logger.info(`Content-Security-Policy configured (isDev=${isDev}): ${cspPolicy}`);
  }
}

export function createContentSecurityPolicyModule(): ContentSecurityPolicyModule {
  return new ContentSecurityPolicyModule();
}
