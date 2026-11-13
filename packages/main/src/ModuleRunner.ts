import { app } from 'electron';
import type { AppModule } from './AppModule';
import type { ModuleContext } from './ModuleContext';

class ModuleRunner implements PromiseLike<void> {
  private promise: Promise<void>;

  constructor() {
    this.promise = Promise.resolve();
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined,
  ): PromiseLike<TResult1 | TResult2> {
    // biome-ignore lint/suspicious/noExplicitAny: Delegate error handler to Promise#then
    return this.promise.then(onfulfilled, onrejected as any);
  }

  init(module: AppModule) {
    const p = module.enable(this.createModuleContext());

    if (p instanceof Promise) {
      this.promise = this.promise.then(() => p);
    }

    return this;
  }

  private createModuleContext(): ModuleContext {
    return {
      app,
    };
  }
}

export function createModuleRunner() {
  return new ModuleRunner();
}
