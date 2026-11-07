import type { AppModule } from '../AppModule';
import { appLifecycle } from '../lifecycle';
import type { ModuleContext } from '../ModuleContext';
import { getAppConfigStore } from './config.module';

export class ApplicationTerminatorOnLastWindowClose implements AppModule {
  enable({ app }: ModuleContext): Promise<void> | void {
    app.on('window-all-closed', () => {
      const configStore = getAppConfigStore();
      const shouldMinimizeToTray = configStore.get('minimizeToTray');

      // 开启了最小化到托盘且未处于退出态：主窗口销毁后应用常驻系统托盘，阻止自动退出
      if (!appLifecycle.isQuitting && shouldMinimizeToTray) {
        return;
      }

      // 未开启托盘常驻时，最后一个窗口关闭即退出；下载中的更新随进程结束放弃
      app.quit();
    });
  }
}

export function terminateAppOnLastWindowClose(
  ...args: ConstructorParameters<typeof ApplicationTerminatorOnLastWindowClose>
) {
  return new ApplicationTerminatorOnLastWindowClose(...args);
}
