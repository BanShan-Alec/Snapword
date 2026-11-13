import type { ModuleContext } from './ModuleContext';

export interface AppModule {
  enable(context: ModuleContext): Promise<void> | void;
}
