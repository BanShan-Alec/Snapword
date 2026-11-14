import type * as Electron from 'electron';
import type { AppModule } from '../AppModule';
import { getLogManager } from './log.module';

export class SingleInstanceApp implements AppModule {
  enable({ app }: { app: Electron.App }): void {
    const isSingleInstance = app.requestSingleInstanceLock();
    if (!isSingleInstance) {
      // 抢锁失败最常见成因：上一实例关闭主窗口后退守托盘、仍持有锁。
      // 一条 log.warn 同时落盘 main.log 并经控制台 transport 回显到终端
      const message =
        'Cannot acquire single instance lock: another instance is running (check the tray icon). Exiting.';
      getLogManager().scoped(this).warn(message);
      app.quit();
      process.exit(0);
    }
  }
}

export function disallowMultipleAppInstance(
  ...args: ConstructorParameters<typeof SingleInstanceApp>
) {
  return new SingleInstanceApp(...args);
}
