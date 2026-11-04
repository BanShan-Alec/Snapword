import type { AppModule } from '../AppModule';
import { registerAllControllers } from '../controllers';
import type { ModuleContext } from '../ModuleContext';
import { getLogManager } from './log.module';

export class IPCModule implements AppModule {
  private readonly logger = getLogManager().scoped(this);

  enable(_context: ModuleContext): void {
    registerAllControllers();
    this.logger.info('Registered all controllers successfully');
  }
}

export function createIPCModule(): AppModule {
  return new IPCModule();
}
