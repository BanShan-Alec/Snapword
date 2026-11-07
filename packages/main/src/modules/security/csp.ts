import { PROJECT_DOCS_ORIGIN } from '@app/shared/constants/docs';
import { session } from 'electron';
import type { AppModule } from '../../AppModule';
import { getEnv } from '../../env';
import type { ModuleContext } from '../../ModuleContext';
import { getLogManager } from '../log.module';
import { buildCspPolicy, shouldInjectCsp } from './csp-policy';

function getValidOrigin(urlStr: string | undefined): string | null {
  if (!urlStr) return null;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin;
    }
  } catch {
    // 忽略格式非法的 URL
  }
  return null;
}

/**
 * CSP 安全模块：
 * 统一拦截 session 请求响应头，注入 Content-Security-Policy，
 * 解决渲染进程安全告警 (Insecure Content-Security-Policy)，同时兼容开发调试环境 (Vite/HMR) 及基础外链资源。
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

    // 动态提取 API 网关 Origin，若配置则允许渲染进程 connect-src 跨域直连
    const apiBaseUrl = getEnv('API_BASE_URL');
    const apiOrigin = getValidOrigin(apiBaseUrl);

    // 开发态：允许自身、内联脚本/样式、eval、data/blob 协议、https/http 与 ws:（支持 Vite HMR 和本地开发服务器）；
    // 生产态：收紧策略，移除 unsafe-eval，放行必要自身源、首屏协调器内联脚本 ('unsafe-inline')、内联样式与静态媒体，
    // 动态放行 apiBaseUrl，并显式放行文档站 origin 的 frame-src（否则跨源 iframe 被 default-src 'self' 拦掉）
    const cspPolicy = buildCspPolicy({
      isDev,
      apiOrigin,
      docsOrigin: PROJECT_DOCS_ORIGIN,
    });

    defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders };

      // CSP 是文档级策略：只注入主框架。子框架（文档站 iframe）不能被套上应用 CSP，
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
