import type { AppModule } from '../../AppModule';
import type { ModuleContext } from '../../ModuleContext';

export abstract class AbstractSecurityRule implements AppModule {
  enable({ app }: ModuleContext): Promise<void> | void {
    app.on('web-contents-created', (_, contents) => this.applyRule(contents));
  }

  abstract applyRule(contents: Electron.WebContents): Promise<void> | void;
}
