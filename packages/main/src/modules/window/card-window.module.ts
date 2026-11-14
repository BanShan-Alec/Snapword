import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import {
  CARD_WINDOW_DEFAULT_HEIGHT,
  CARD_WINDOW_MAX_WORK_AREA_RATIO,
  CARD_WINDOW_MIN_HEIGHT,
  CARD_WINDOW_SNAP_MARGIN,
  CARD_WINDOW_WIDTH,
} from '@app/shared/constants/window-geometry';
import { STARTUP_THEME_QUERY_KEY, WINDOW_IDS } from '@app/shared/constants/windows';
import type { SelectionPayload } from '@app/shared/schemas/capture';
import type { CardActionPayload } from '@app/shared/types/card';
import { BrowserWindow, globalShortcut, screen } from 'electron';
import type { AppInitConfig } from '../../AppInitConfig';
import type { AppModule } from '../../AppModule';
import { getPackedEnvArgument } from '../../env';
import type { ModuleContext } from '../../ModuleContext';
import { getCaptureSupervisorModule } from '../capture-supervisor.module';
import { getAppConfigStore } from '../config.module';
import { getLogManager } from '../log.module';
import { resolveNativeTheme } from '../native-theme.module';
import { calculateCardBounds, calculateCardRebound } from './card-geometry';
import { resolveSelectionDispatch } from './card-shortcut';
import { getHomeWindowModule } from './home-window.module';
import { getWindowBackgroundColor } from './titlebar-overlay';
import { forgetWindow, getWindow, registerWindow, sendToWindow } from './window-registry';

export interface CardWindowModuleOptions {
  initConfig: AppInitConfig;
  openDevTools?: boolean;
}

export class CardWindowModule implements AppModule {
  private readonly preload: { path: string };
  private readonly renderer: { path: string } | URL;
  private readonly openDevTools: boolean;
  private readonly logger = getLogManager().scoped('CardWindowModule');

  private lastDraggedPosition: { x: number; y: number } | null = null;
  private currentHeight: number = CARD_WINDOW_DEFAULT_HEIGHT;
  private isPinned = false;
  private pendingAction: CardActionPayload | null = null;

  constructor({ initConfig, openDevTools = false }: CardWindowModuleOptions) {
    this.preload = initConfig.preload;
    this.renderer = initConfig.windows.card;
    this.openDevTools = openDevTools;
  }

  async enable({ app: electronApp }: ModuleContext): Promise<void> {
    await electronApp.whenReady();

    // 1. 注册全局快捷键 Alt+W (RC-01 / RC-09)
    try {
      const registered = globalShortcut.register('Alt+W', () => {
        this.handleHotkey().catch((err) => {
          this.logger.error('Alt+W 唤起卡片异常:', err);
        });
      });
      if (registered) {
        this.logger.info('已成功注册翻译卡片全局热键 Alt+W');
      } else {
        this.logger.warn('注册翻译卡片全局热键 Alt+W 失败 (可能已被系统占用)');
      }
    } catch (err) {
      this.logger.error('全局热键 Alt+W 注册异常:', err);
    }

    // 2. 监听圆点点击事件驱动卡片 (B-02 §7)
    try {
      const captureSupervisor = getCaptureSupervisorModule();
      captureSupervisor.on('dot_clicked', (payload: SelectionPayload) => {
        this.handleDotClicked(payload).catch((err) => {
          this.logger.error('圆点点击唤起卡片异常:', err);
        });
      });
    } catch (err) {
      this.logger.warn('挂载 captureSupervisor dot_clicked 监听异常:', err);
    }

    electronApp.on('will-quit', () => {
      try {
        globalShortcut.unregister('Alt+W');
      } catch {
        // ignore
      }
    });
  }

  /**
   * 创建或复用独立的 420px 置顶 Card BrowserWindow (RC-01 / RC-03)
   */
  async createWindow(): Promise<BrowserWindow> {
    const existing = getWindow(WINDOW_IDS.CARD);
    if (existing && !existing.isDestroyed()) {
      return existing;
    }

    this.logger.info('Creating Card browser window (420px alwaysOnTop non-focusable)');

    const primaryDisplay = screen.getPrimaryDisplay();
    const initialBounds = calculateCardBounds({
      selectionRect: null,
      cardSize: { width: CARD_WINDOW_WIDTH, height: this.currentHeight },
      workArea: primaryDisplay.workArea,
      lastDraggedPosition: this.lastDraggedPosition,
    });

    const resolvedTheme = resolveNativeTheme(getAppConfigStore().get('theme'));

    const browserWindow = new BrowserWindow({
      name: WINDOW_IDS.CARD,
      show: false,
      width: initialBounds.width,
      height: initialBounds.height,
      x: initialBounds.x,
      y: initialBounds.y,
      minWidth: CARD_WINDOW_WIDTH,
      maxWidth: CARD_WINDOW_WIDTH,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
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

    getLogManager().logWindowStarted(WINDOW_IDS.CARD);
    registerWindow(WINDOW_IDS.CARD, browserWindow);

    browserWindow.on('closed', () => {
      forgetWindow(WINDOW_IDS.CARD, browserWindow);
    });

    // 拖拽松手吸附回弹算法 (RC-13)
    browserWindow.on('moved', () => {
      if (browserWindow.isDestroyed()) return;
      const currentBounds = browserWindow.getBounds();
      const display = screen.getDisplayMatching(currentBounds);
      const rebound = calculateCardRebound(
        currentBounds,
        display.workArea,
        CARD_WINDOW_SNAP_MARGIN,
      );
      if (rebound.rebounded) {
        browserWindow.setBounds({
          x: rebound.x,
          y: rebound.y,
          width: currentBounds.width,
          height: currentBounds.height,
        });
      }
      this.lastDraggedPosition = { x: rebound.x, y: rebound.y };
    });

    browserWindow.webContents.on('did-finish-load', () => {
      if (this.pendingAction && !browserWindow.isDestroyed()) {
        const action = this.pendingAction;
        this.pendingAction = null;
        sendToWindow(WINDOW_IDS.CARD, IPC_CHANNELS.CARD_EVENT_ACTION, action);
      }
    });

    if (this.openDevTools) {
      browserWindow.webContents.openDevTools({ mode: 'detach' });
    }

    const targetUrl =
      this.renderer instanceof URL
        ? new URL(this.renderer.toString())
        : new URL(`file://${this.renderer.path}`);
    targetUrl.searchParams.set(STARTUP_THEME_QUERY_KEY, resolvedTheme);

    await browserWindow.loadURL(targetUrl.toString());

    return browserWindow;
  }

  /**
   * 展示卡片并派发翻译动作或内联提示 (RC-01: 不夺取键盘焦点)
   */
  async showCard(action: CardActionPayload): Promise<void> {
    const win = await this.createWindow();

    const selectionRect = action.selection?.rects?.[0] ?? null;

    let targetDisplay = screen.getPrimaryDisplay();
    if (selectionRect) {
      targetDisplay = screen.getDisplayMatching({
        x: selectionRect.x,
        y: selectionRect.y,
        width: selectionRect.width,
        height: selectionRect.height,
      });
    } else {
      const cursor = screen.getCursorScreenPoint();
      targetDisplay = screen.getDisplayNearestPoint(cursor);
    }

    const bounds = calculateCardBounds({
      selectionRect,
      cardSize: { width: CARD_WINDOW_WIDTH, height: this.currentHeight },
      workArea: targetDisplay.workArea,
      lastDraggedPosition: this.lastDraggedPosition,
    });

    win.setPosition(bounds.x, bounds.y);

    // RC-01: 必须不夺取焦点展示，避免破坏前台应用选区
    win.showInactive();

    if (win.webContents.isLoading()) {
      this.pendingAction = action;
    } else {
      sendToWindow(WINDOW_IDS.CARD, IPC_CHANNELS.CARD_EVENT_ACTION, action);
    }
  }

  /**
   * 隐藏卡片窗口
   */
  hideCard(): void {
    const win = getWindow(WINDOW_IDS.CARD);
    if (win && !win.isDestroyed()) {
      win.hide();
    }
  }

  /**
   * 内容自适应重算高度 (RC-03: 最大占工作区 70%)
   */
  resizeCard(height: number): void {
    const win = getWindow(WINDOW_IDS.CARD);
    if (!win || win.isDestroyed()) return;

    const currentBounds = win.getBounds();
    const display = screen.getDisplayMatching(currentBounds);
    const maxAllowed = Math.floor(display.workArea.height * CARD_WINDOW_MAX_WORK_AREA_RATIO);
    const clampedHeight = Math.min(Math.max(height, CARD_WINDOW_MIN_HEIGHT), maxAllowed);

    this.currentHeight = clampedHeight;
    win.setSize(CARD_WINDOW_WIDTH, clampedHeight);
  }

  /**
   * 切换防误关状态 (RC-04 / RC-14)
   */
  setPin(pin: boolean): void {
    this.isPinned = pin;
    this.logger.info('Card pin status toggled:', { isPinned: this.isPinned });
  }

  getPinStatus(): boolean {
    return this.isPinned;
  }

  /**
   * 在主窗口打开当前内容并隐藏卡片 (RC-18)
   */
  openInHome(_data?: unknown): void {
    this.hideCard();
    const homeModule = getHomeWindowModule();
    if (homeModule) {
      homeModule.restoreOrCreateWindow(true).catch((err) => {
        this.logger.error('Failed to restore home window from card:', err);
      });
    }
  }

  /**
   * 处理 Alt+W 全局热键唤起 (IA-23 / IA-24 / RC-09)
   */
  async handleHotkey(): Promise<void> {
    const capture = getCaptureSupervisorModule();
    let selection: SelectionPayload | null = null;

    try {
      selection = await capture.captureCurrent('hotkey', 500);
    } catch (err) {
      this.logger.warn('Alt+W captureCurrent failed or timed out:', err);
    }

    const text = selection?.text;
    const dispatch = resolveSelectionDispatch(text);

    if (dispatch.action === 'notice') {
      await this.showCard({
        action: 'notice',
        notice: dispatch.notice,
        text: text ?? '',
        selection: selection ?? undefined,
      });
    } else {
      await this.showCard({
        action: 'translate',
        mode: dispatch.mode,
        text: text ?? '',
        context: selection?.paragraph ?? '',
        selection: selection ?? undefined,
      });
    }
  }

  /**
   * 处理圆点点击唤起
   */
  async handleDotClicked(payload: SelectionPayload): Promise<void> {
    const text = payload.text ?? '';
    const dispatch = resolveSelectionDispatch(text);

    if (dispatch.action === 'notice') {
      await this.showCard({
        action: 'notice',
        notice: dispatch.notice,
        text,
        selection: payload,
      });
    } else {
      await this.showCard({
        action: 'translate',
        mode: dispatch.mode,
        text,
        context: payload.paragraph ?? '',
        selection: payload,
      });
    }
  }
}

let cardWindowModule: CardWindowModule | null = null;

export function getCardWindowModule(): CardWindowModule {
  if (!cardWindowModule) {
    throw new Error('CardWindowModule has not been initialized');
  }
  return cardWindowModule;
}

export function createCardWindowModule(options: CardWindowModuleOptions): CardWindowModule {
  if (!cardWindowModule) {
    cardWindowModule = new CardWindowModule(options);
  }
  return cardWindowModule;
}
