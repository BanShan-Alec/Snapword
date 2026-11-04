import { URL } from 'node:url';
import { shell } from 'electron';
import type { AppModule } from '../../AppModule';
import type { ModuleContext } from '../../ModuleContext';
import { getLogManager } from '../log.module';

let globalAllowedExternalOrigins = new Set<string>();

export function isAllowedExternalUrl(urlString: string): boolean {
  try {
    const parsedUrl = new URL(urlString);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return false;
    }
    return globalAllowedExternalOrigins.has(parsedUrl.origin);
  } catch {
    return false;
  }
}

export class ExternalUrls implements AppModule {
  private readonly externalUrls: Set<string>;
  private readonly logger = getLogManager().scoped(this);

  constructor(externalUrls: Set<string>) {
    this.externalUrls = externalUrls;
    globalAllowedExternalOrigins = externalUrls;
  }

  enable({ app }: ModuleContext): Promise<void> | void {
    app.on('web-contents-created', (_, contents) => {
      contents.setWindowOpenHandler(({ url }) => {
        try {
          const parsedUrl = new URL(url);

          // 仅允许安全的网络协议
          if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            this.logger.warn(`Blocked non-http(s) protocol navigation: ${url}`);
            return { action: 'deny' };
          }

          if (this.externalUrls.has(parsedUrl.origin)) {
            shell.openExternal(url).catch((err) => {
              this.logger.error('Failed to open external URL:', err);
            });
          } else {
            this.logger.warn(
              `Blocked opening of a disallowed external origin: ${parsedUrl.origin}`,
            );
          }
        } catch (err) {
          this.logger.warn(`Malformed or invalid URL received: ${url}`, err);
        }

        // Prevent creating a new window.
        return { action: 'deny' };
      });
    });
  }
}

export function allowExternalUrls(...args: ConstructorParameters<typeof ExternalUrls>) {
  return new ExternalUrls(...args);
}
