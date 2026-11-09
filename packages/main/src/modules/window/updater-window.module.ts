import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { UPDATER_WINDOW_HEIGHT, UPDATER_WINDOW_WIDTH } from '@app/shared/constants/window-geometry';
import { STARTUP_THEME_QUERY_KEY, WINDOW_IDS } from '@app/shared/constants/windows';
import { app, BrowserWindow } from 'electron';
import type { AppInitConfig } from '../../AppInitConfig';
import type { AppModule } from '../../AppModule';
import { getPackedEnvArgument } from '../../env';
import { appLifecycle } from '../../lifecycle';
import type { ModuleContext } from '../../ModuleContext';
import { updaterService } from '../../services/updater.service';
import { getAppConfigStore } from '../config.module';
import { getLogManager } from '../log.module';
import { resolveNativeTheme } from '../native-theme.module';
import { getWindowBackgroundColor } from './titlebar-overlay';
import { forgetWindow, getWindow, registerWindow, sendToWindow } from './window-registry';

export class UpdaterWindowModule implements AppModule {
  private readonly preload: { path: string };
  private readonly renderer: { path: string } | URL;
  private readonly logger = getLogManager().scoped(this);

  constructor({ initConfig }: { initConfig: AppInitConfig }) {
    this.preload = initConfig.preload;
    this.renderer = initConfig.windows.updater;

    // 绑定更新服务的窗口代理
    updaterService.setWindowDelegate({
      show: () => this.show(),
      close: () => this.close(),
    });
  }

  async enable({ app }: ModuleContext): Promise<void> {
    await app.whenReady();
  }

  async createWindow(): Promise<BrowserWindow> {
    const existing = getWindow(WINDOW_IDS.UPDATER);
    if (existing && !existing.isDestroyed()) {
      return existing;
    }

    this.logger.info('Creating updater browser window');

    // 显式主题链同 home 窗口：backgroundColor 与 renderer 首帧 query 使用同一解析值
    const resolvedTheme = resolveNativeTheme(getAppConfigStore().get('theme'));

    const browserWindow = new BrowserWindow({
      show: false,
      width: UPDATER_WINDOW_WIDTH,
      height: UPDATER_WINDOW_HEIGHT,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      frame: false,
      transparent: false,
      hasShadow: true,
      backgroundColor: getWindowBackgroundColor(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: false,
        preload: this.preload.path,
        additionalArguments: [getPackedEnvArgument()],
      },
    });

    // 窗口创建即写入 renderer-updater.log 的生命周期分隔行；reload 不重建窗口，不会重复写
    getLogManager().logWindowStarted(WINDOW_IDS.UPDATER);

    registerWindow(WINDOW_IDS.UPDATER, browserWindow);

    const readyToShowPromise = new Promise<void>((resolve) => {
      browserWindow.once('ready-to-show', () => {
        this.logger.info('Updater window ready to show');
        resolve();
      });
    });

    browserWindow.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL) => {
        this.logger.error(
          `Updater window failed to load URL "${validatedURL}": (${errorCode}) ${errorDescription}`,
        );
      },
    );

    browserWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
      this.logger.error(`Updater window preload script failed at "${preloadPath}":`, error);
    });

    browserWindow.webContents.on('did-finish-load', () => {
      this.logger.info('Updater window did-finish-load -> pushing snapshot');
      sendToWindow(
        WINDOW_IDS.UPDATER,
        IPC_CHANNELS.UPDATER_EVENT_STATE,
        updaterService.getSnapshot(),
      );
    });

    // 支持点击关闭/隐藏到后台时销毁更新窗口以释放内存；若无主窗口且未开启托盘常驻则退出应用
    browserWindow.on('close', () => {
      updaterService.notifyWindowClosed();
      const configStore = getAppConfigStore();
      const shouldMinimizeToTray = configStore.get('minimizeToTray');
      const homeWin = getWindow(WINDOW_IDS.HOME);
      if (
        !appLifecycle.isQuitting &&
        !shouldMinimizeToTray &&
        (!homeWin || homeWin.isDestroyed())
      ) {
        this.logger.info(
          'Home window does not exist and tray disabled, closing updater will quit app',
        );
        app.quit();
      } else {
        this.logger.info('Updater window closed and destroyed');
      }
    });

    if (this.renderer instanceof URL) {
      const url = new URL(this.renderer.href);
      url.searchParams.set(STARTUP_THEME_QUERY_KEY, resolvedTheme);
      await browserWindow.loadURL(url.href);
    } else {
      await browserWindow.loadFile(this.renderer.path, {
        query: { [STARTUP_THEME_QUERY_KEY]: resolvedTheme },
      });
    }

    await readyToShowPromise;

    return browserWindow;
  }

  async show(): Promise<BrowserWindow> {
    let win = getWindow(WINDOW_IDS.UPDATER);
    if (!win || win.isDestroyed()) {
      win = await this.createWindow();
    }

    updaterService.notifyWindowShown();

    if (win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();

    // 立即向窗口同步最新状态快照
    sendToWindow(
      WINDOW_IDS.UPDATER,
      IPC_CHANNELS.UPDATER_EVENT_STATE,
      updaterService.getSnapshot(),
    );

    return win;
  }

  close(): void {
    updaterService.notifyWindowClosed();
    const win = getWindow(WINDOW_IDS.UPDATER);
    if (win && !win.isDestroyed()) {
      win.close();
      this.logger.info('Updater window closed and destroyed');
    }
  }

  destroy(): void {
    const win = getWindow(WINDOW_IDS.UPDATER);
    if (win && !win.isDestroyed()) {
      forgetWindow(WINDOW_IDS.UPDATER, win);
      win.destroy();
      this.logger.info('Updater window destroyed');
    }
  }
}

let singletonUpdaterWindowModule: UpdaterWindowModule | null = null;

export function getUpdaterWindowModule(): UpdaterWindowModule {
  if (!singletonUpdaterWindowModule) {
    throw new Error('UpdaterWindowModule has not been initialized');
  }
  return singletonUpdaterWindowModule;
}

export function createUpdaterWindowModule(
  ...args: ConstructorParameters<typeof UpdaterWindowModule>
): UpdaterWindowModule {
  singletonUpdaterWindowModule = new UpdaterWindowModule(...args);
  return singletonUpdaterWindowModule;
}
