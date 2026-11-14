import type { AppModule } from '../AppModule';
import { appLifecycle } from '../lifecycle';
import type { ModuleContext } from '../ModuleContext';
import { getAppConfigStore } from './config.module';
import { getLogManager } from './log.module';

export class ApplicationTerminatorOnLastWindowClose implements AppModule {
  enable({ app }: ModuleContext): Promise<void> | void {
    app.on('window-all-closed', () => {
      const configStore = getAppConfigStore();
      const shouldMinimizeToTray = configStore.get('minimizeToTray');

      // 开启了最小化到托盘且未处于退出态：主窗口销毁后应用常驻系统托盘，阻止自动退出
      if (!appLifecycle.isQuitting && shouldMinimizeToTray) {
        return;
      }

      if (appLifecycle.isQuitting) {
        // 正常退出时 Electron 会抑制该事件；走到这里说明上一次退出已被复位
        //（典型为晚到的窗口关闭取消通知），本次 app.quit() 是兜底重试
        getLogManager().scoped(this).info('Last window closed during quit; requesting quit retry');
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
