import type * as Electron from 'electron';
import type { AppModule } from '../AppModule';
import { getLogManager } from './log.module';

/**
 * 单实例锁（B-01 §7 第 1 步 / §10.2）
 *
 * 抢锁失败 = 已有实例在运行（打包版托盘常驻 / 旧 dev 实例）：
 * 本实例直接退出；聚焦已有实例由已持有锁实例收到 'second-instance' 事件后
 * 在 WindowManager 中完成（show + focus）。
 */
export class SingleInstanceApp implements AppModule {
  enable({ app }: { app: Electron.App }): void {
    const isSingleInstance = app.requestSingleInstanceLock();
    if (!isSingleInstance) {
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
