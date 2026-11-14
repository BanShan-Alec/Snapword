import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { STARTUP_THEME_QUERY_KEY, WINDOW_IDS } from '@app/shared/constants/windows';
import type { CloseBehaviorChoice } from '@app/shared/schemas/close-behavior';
import { app, BrowserWindow, screen } from 'electron';
import type { AppInitConfig } from '../../AppInitConfig';
import type { AppModule } from '../../AppModule';
import { getPackedEnvArgument } from '../../env';
import { appLifecycle } from '../../lifecycle';
import type { ModuleContext } from '../../ModuleContext';
import { updaterService } from '../../services/updater.service';
import { getAppConfigStore } from '../config.module';
import { getLogManager } from '../log.module';
import { applyTitleBarOverlay, resolveNativeTheme } from '../native-theme.module';
import { getTitleBarOverlayOptions, getWindowBackgroundColor } from './titlebar-overlay';
import {
  broadcast,
  forgetWindow,
  getWindow,
  registerWindow,
  sendToWindow,
} from './window-registry';
import { attachWindowsWindowRepaint } from './window-repaint';
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, resolveWindowBounds } from './window-size';

const QUIT_CANCEL_TIMEOUT_MS = 2000;

export interface HomeWindowModuleOptions {
  initConfig: AppInitConfig;
  openDevTools?: boolean;
  keepState?: boolean;
}

export class HomeWindowModule implements AppModule {
  private readonly preload: { path: string };
  private readonly renderer: { path: string } | URL;
  private readonly openDevTools: boolean;
  private readonly keepState: boolean;
  private closeGuardBypass = false;
  private closeRequestPending = false;
  private quitAfterCancelPending = false;

  constructor({ initConfig, openDevTools = false, keepState = true }: HomeWindowModuleOptions) {
    this.preload = initConfig.preload;
    this.renderer = initConfig.windows.home;
    this.openDevTools = openDevTools;
    this.keepState = keepState;
  }

  async enable({ app: electronApp }: ModuleContext): Promise<void> {
    await electronApp.whenReady();
    await this.restoreOrCreateWindow(true);

    const handleReactivation = async () => {
      await this.restoreOrCreateWindow(true);
    };
    electronApp.on('second-instance', () => handleReactivation());
    electronApp.on('activate', () => handleReactivation());
  }

  async createWindow(): Promise<BrowserWindow> {
    // 首次启动的尺寸与居中由纯函数计算；若存在官方持久化状态，
    // Electron 会在构造期用保存的 bounds/displayMode 覆盖这些构造参数
    const initialBounds = resolveWindowBounds(null, screen.getPrimaryDisplay());

    const logger = getLogManager().scoped(this);

    logger.info('Creating browser window with initial bounds:', initialBounds);

    // 原生标题栏定制（平台分支参照 VS Code windows.ts/windowImpl.ts）：
    // - darwin: titleBarStyle hidden 保留红绿灯；titleBarOverlay: true 仅启用
    //   WCO JS API 与 CSS env(titlebar-area-*)（color/symbolColor 在 darwin 无效）
    // - win32: hidden + frame:false 启用 WCO，overlay 颜色随主题
    //   （运行时更新见 native-theme.module applyTitleBarOverlay）
    // - linux: 保持系统默认边框，不做定制
    const isMac = process.platform === 'darwin';
    const isWin = process.platform === 'win32';

    // 显式主题链：读持久偏好 → 幂等同步 themeSource → 解析具体明暗。
    // backgroundColor / WCO overlay / renderer 首帧 query 均以本次解析结果为准，不依赖模块装配顺序。
    const resolvedTheme = resolveNativeTheme(getAppConfigStore().get('theme'));

    const browserWindow = new BrowserWindow({
      title: app.getName(),
      // 官方窗口状态持久化：唯一 name 即存储键，bounds 与 displayMode 均默认开启。
      // 已知限制：Windows 分数缩放（1.25/1.5/1.75）下每次启动会漂移 1-2px，整数缩放稳定；
      // 上游 issue：https://github.com/electron/electron/issues/55245
      name: WINDOW_IDS.HOME,
      windowStatePersistence: this.keepState,
      // 首屏渐进式加载：不设 show:false 门禁，窗口创建即可见，
      // 首个可视内容为 backgroundColor 主题底色（与 WCO overlay 同源），禁止白屏期
      x: initialBounds.x,
      y: initialBounds.y,
      width: initialBounds.width,
      height: initialBounds.height,
      // 最小尺寸下限，防止窗口缩到布局不可用（updater 窗口为 480×460）
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      backgroundColor: getWindowBackgroundColor(),
      ...(isMac ? { titleBarStyle: 'hidden', titleBarOverlay: true } : {}),
      ...(isWin
        ? {
            titleBarStyle: 'hidden',
            frame: false,
            titleBarOverlay: getTitleBarOverlayOptions(),
          }
        : {}),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: false,
        preload: this.preload.path,
        additionalArguments: [getPackedEnvArgument()],
      },
    });

    // 窗口创建即写入 renderer-home.log 的生命周期分隔行；reload 不重建窗口，不会重复写
    getLogManager().logWindowStarted(WINDOW_IDS.HOME);
    logger.info('Browser window bounds after creation:', browserWindow.getNormalBounds());

    // 注册到 window-registry 唯一事实源
    registerWindow(WINDOW_IDS.HOME, browserWindow);

    // WCO overlay 初刷：与 backgroundColor 同源同时点（本模块只负责运行时 updated 重刷）
    applyTitleBarOverlay();

    browserWindow.on('closed', () => {
      this.closeRequestPending = false;
      this.closeGuardBypass = false;
      this.quitAfterCancelPending = false;
      forgetWindow(WINDOW_IDS.HOME, browserWindow);
    });

    // win32 dom-ready 补偿：无边框窗口在 dom-ready 前可能未完成首帧合成，
    // 补一次 show+focus 避免任务栏有图标但窗口不可见（对齐上游 desktopWindowLifecycle）
    browserWindow.webContents.on('dom-ready', () => {
      if (process.platform === 'win32' && !browserWindow.isDestroyed()) {
        browserWindow.show();
        browserWindow.focus();
      }
      if (this.openDevTools) {
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

    // 支持点击关闭按钮销毁主窗口并退守系统托盘及防僵尸退出闭环
    browserWindow.on('close', (event) => {
      if (appLifecycle.isQuitting) {
        this.closeRequestPending = false;
        return;
      }

      if (this.closeGuardBypass) {
        this.closeGuardBypass = false;
      } else if (!getAppConfigStore().get('closeBehaviorConfirmed')) {
        event.preventDefault();
        if (!this.closeRequestPending) {
          this.closeRequestPending = true;
          getLogManager().scoped(this).info('First close intercepted; asking renderer');
        }
        sendToWindow(WINDOW_IDS.HOME, IPC_CHANNELS.WINDOW_CLOSE_REQUESTED, null);
        return;
      }

      const configStore = getAppConfigStore();
      const shouldMinimizeToTray = configStore.get('minimizeToTray');

      if (shouldMinimizeToTray) {
        // 用户开启了关闭时最小化到托盘：允许窗口自然销毁以彻底释放内存，
        // 不拦截 close 事件（不 event.preventDefault()），亦不触发 app.quit()，
        // 应用进程继续保留系统托盘常驻。
        logger.info('Home window closed and destroyed -> running in tray');
      } else {
        logger.info('Home window is closing');
        event.preventDefault();
        if (!this.quitAfterCancelPending) {
          this.quitAfterCancelPending = true;
          void this.quitAfterCancellingUpdate();
        }
      }
    });

    // 无边框重绘守护全生命周期挂载（win32）：跨屏拖拽 / Snap / 锁屏唤醒后补绘
    attachWindowsWindowRepaint(browserWindow);

    if (this.renderer instanceof URL) {
      const url = new URL(this.renderer.href);
      url.searchParams.set(STARTUP_THEME_QUERY_KEY, resolvedTheme);
      await browserWindow.loadURL(url.href);
    } else {
      await browserWindow.loadFile(this.renderer.path, {
        query: { [STARTUP_THEME_QUERY_KEY]: resolvedTheme },
      });
    }

    return browserWindow;
  }

  markRendererReady(): void {
    if (this.closeRequestPending) {
      sendToWindow(WINDOW_IDS.HOME, IPC_CHANNELS.WINDOW_CLOSE_REQUESTED, null);
    }
  }

  async respondCloseRequest(choice: CloseBehaviorChoice): Promise<void> {
    const window = getWindow(WINDOW_IDS.HOME);
    if (!window || !this.closeRequestPending) return;

    this.closeRequestPending = false;
    getLogManager().scoped(this).info(`Close prompt answered: ${choice}`);

    if (choice === 'cancel') return;

    const updated = getAppConfigStore().set({
      minimizeToTray: choice === 'window',
      closeBehaviorConfirmed: true,
    });
    broadcast(IPC_CHANNELS.CONFIG_EVENT_CHANGED, updated);
    this.closeGuardBypass = true;
    window.close();
  }

  private async quitAfterCancellingUpdate(): Promise<void> {
    const logger = getLogManager().scoped(this);
    try {
      await Promise.race([
        updaterService.cancel(),
        new Promise<void>((resolve) => setTimeout(resolve, QUIT_CANCEL_TIMEOUT_MS)),
      ]);
    } catch (err) {
      logger.warn('Failed to cancel update download before quitting:', err);
    }
    app.quit();
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

let singletonHomeWindowModule: HomeWindowModule | null = null;

export function getHomeWindowModule(): HomeWindowModule | null {
  return singletonHomeWindowModule;
}

export function createHomeWindowModule(
  ...args: ConstructorParameters<typeof HomeWindowModule>
): HomeWindowModule {
  singletonHomeWindowModule = new HomeWindowModule(...args);
  const globalRef = globalThis as unknown as {
    __homeWindowModule?: HomeWindowModule;
    __windowManager?: HomeWindowModule;
  };
  globalRef.__homeWindowModule = singletonHomeWindowModule;
  globalRef.__windowManager = singletonHomeWindowModule;
  return singletonHomeWindowModule;
}
