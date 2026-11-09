import type { AppModule } from '../AppModule';
import type { ModuleContext } from '../ModuleContext';

export class HardwareAccelerationModule implements AppModule {
  private readonly shouldBeDisabled: boolean;

  constructor({ enable }: { enable: boolean }) {
    this.shouldBeDisabled = !enable;
  }

  enable({ app }: ModuleContext): Promise<void> | void {
    if (this.shouldBeDisabled) {
      app.disableHardwareAcceleration();
    }
  }
}

export function hardwareAccelerationMode(
  ...args: ConstructorParameters<typeof HardwareAccelerationModule>
) {
  return new HardwareAccelerationModule(...args);
}
