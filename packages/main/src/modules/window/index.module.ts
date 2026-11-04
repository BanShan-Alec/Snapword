import { WINDOW_IDS } from '@app/shared/constants/windows';
import { app, BrowserWindow, screen } from 'electron';
import type { AppInitConfig } from '../../AppInitConfig';
import type { AppModule } from '../../AppModule';
import { appLifecycle } from '../../lifecycle';
import type { ModuleContext } from '../../ModuleContext';
import { getLogManager } from '../log.module';
import { forgetWindow, getWindow, registerWindow } from './window-registry';
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, resolveWindowBounds } from './window-size';

/**
 * 主窗口管理（B-01 §10.2）
 *
 * P4 骨架范围：单实例主窗口 + 关闭隐藏到托盘。
 * 暂不做（B-01 §7）：卡片窗口按需创建与 createMs/firstPaintMs 埋点、
 * 主窗口位置记忆的恢复策略细化（当前依赖 Electron 内建 windowStatePersistence）。
 */
export interface WindowManagerOptions {
  initConfig: AppInitConfig;
  openDevTools?: boolean;
}

export class WindowManager implements AppModule {
  private readonly preload: { path: string };
  private readonly renderer: { path: string } | URL;
  private readonly openDevTools: boolean;

  constructor({ initConfig, openDevTools = false }: WindowManagerOptions) {
    this.preload = initConfig.preload;
    this.renderer = initConfig.windows.home;
    this.openDevTools = openDevTools;
  }

  async enable({ app: electronApp }: ModuleContext): Promise<void> {
    await electronApp.whenReady();
    await this.restoreOrCreateWindow(true);

    // B-01 §7/§10.2：第二次启动聚焦已有窗口（单实例锁由 single-instance 模块持有）
    const handleReactivation = () => {
      const homeWin = getWindow(WINDOW_IDS.HOME);
      if (!homeWin || homeWin.isDestroyed()) {
        void this.restoreOrCreateWindow(true);
      } else {
        if (homeWin.isMinimized()) {
          homeWin.restore();
        }
        homeWin.show();
        homeWin.focus();
      }
    };
    electronApp.on('second-instance', () => handleReactivation());
    electronApp.on('activate', () => handleReactivation());
  }

  async createWindow(): Promise<BrowserWindow> {
    const logger = getLogManager().scoped(this);
    // 首次启动的尺寸与居中由纯函数计算；存在官方持久化状态时 Electron 以保存值覆盖
    const initialBounds = resolveWindowBounds(null, screen.getPrimaryDisplay());
    logger.info('Creating browser window with initial bounds:', initialBounds);

    const browserWindow = new BrowserWindow({
      title: app.getName(),
      // 官方窗口状态持久化：唯一 name 即存储键，bounds 与 displayMode 均默认开启
      name: WINDOW_IDS.HOME,
      windowStatePersistence: true,
      x: initialBounds.x,
      y: initialBounds.y,
      width: initialBounds.width,
      height: initialBounds.height,
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      webPreferences: {
        // B-01 §5.3：sandbox + contextIsolation，渲染进程不接触 Node
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: false,
        preload: this.preload.path,
      },
    });

    // 窗口创建即写入 renderer-home.log 的生命周期分隔行
    getLogManager().logWindowStarted(WINDOW_IDS.HOME);

    // 注册到 window-registry 唯一事实源
    registerWindow(WINDOW_IDS.HOME, browserWindow);

    browserWindow.on('closed', () => {
      forgetWindow(WINDOW_IDS.HOME, browserWindow);
    });

    browserWindow.webContents.on('dom-ready', () => {
      if (this.openDevTools && !browserWindow.webContents.isDevToolsOpened()) {
        browserWindow.webContents.openDevTools();
      }
    });

    browserWindow.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL) => {
        logger.error(`Failed to load URL "${validatedURL}": (${errorCode}) ${errorDescription}`);
      },
    );

    browserWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
      logger.error(`Preload script failed to load at "${preloadPath}":`, error);
    });

    // B-01 §8：关闭主窗口只隐藏到托盘，不触发退出流程；退出态放行自然关闭
    browserWindow.on('close', (event) => {
      if (appLifecycle.isQuitting) {
        return;
      }
      logger.info('Home window close intercepted -> hide to tray');
      event.preventDefault();
      browserWindow.hide();
    });

    if (this.renderer instanceof URL) {
      await browserWindow.loadURL(this.renderer.href);
    } else {
      await browserWindow.loadFile(this.renderer.path);
    }

    return browserWindow;
  }

  async restoreOrCreateWindow(show = false) {
    let window = getWindow(WINDOW_IDS.HOME);

    if (window === undefined || window.isDestroyed()) {
      window = await this.createWindow();
    }

    if (!show) {
      return window;
    }

    if (window.isMinimized()) {
      window.restore();
    }

    window.show();
    window.focus();

    return window;
  }
}

let singletonWindowManager: WindowManager | null = null;

export function getWindowManager(): WindowManager | null {
  return singletonWindowManager;
}

export function createWindowManagerModule(
  ...args: ConstructorParameters<typeof WindowManager>
): WindowManager {
  singletonWindowManager = new WindowManager(...args);
  (globalThis as unknown as { __windowManager?: WindowManager }).__windowManager =
    singletonWindowManager;
  return singletonWindowManager;
}
