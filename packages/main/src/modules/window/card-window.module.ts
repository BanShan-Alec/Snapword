import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { STARTUP_THEME_QUERY_KEY, WINDOW_IDS } from '@app/shared/constants/windows';
import type {
  DotHiddenMessage,
  ForegroundChangedMessage,
  SelectionPayload,
} from '@app/shared/schemas/capture';
import type { CardActionPayload } from '@app/shared/types/card';
import { BrowserWindow, globalShortcut, screen } from 'electron';
import type { AppInitConfig } from '../../AppInitConfig';
import type { AppModule } from '../../AppModule';
import { abortTranslationsBySource } from '../../controllers/translation.controller';
import { getPackedEnvArgument } from '../../env';
import type { ModuleContext } from '../../ModuleContext';
import { getCaptureSupervisorModule } from '../capture-supervisor.module';
import { getAppConfigStore } from '../config.module';
import { getLogManager } from '../log.module';
import { resolveNativeTheme } from '../native-theme.module';
import {
  type BlurReason,
  CardAntiCloseStateMachine,
  type ForegroundProcessInfo,
} from './card-anti-close';
import { calculateCardBounds } from './card-geometry';
import { resolveSelectionDispatch } from './card-shortcut';
import { getHomeWindowModule } from './home-window.module';
import { getWindowBackgroundColor } from './titlebar-overlay';
import {
  forgetWindow,
  getWindow,
  getWindowName,
  registerWindow,
  sendToWindow,
} from './window-registry';
import { attachWindowsWindowRepaint } from './window-repaint';

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
  private pendingAction: CardActionPayload | null = null;
  private readonly stateMachine = new CardAntiCloseStateMachine();

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
          this.logger.error('Failed to trigger card on Alt+W shortcut:', err);
        });
      });
      if (registered) {
        this.logger.info('Registered card global shortcut Alt+W successfully');
      } else {
        this.logger.warn('Failed to register card global shortcut Alt+W (may be occupied)');
      }
    } catch (err) {
      this.logger.error('Exception registering card global shortcut Alt+W:', err);
    }

    // 2. 监听圆点点击事件驱动卡片 (B-02 §7)
    try {
      const captureSupervisor = getCaptureSupervisorModule();
      captureSupervisor.on('dot_clicked', (payload: SelectionPayload) => {
        this.handleDotClicked(payload).catch((err) => {
          this.logger.error('Failed to trigger card on dot click:', err);
        });
      });
      // 3. 监听前台应用切换与外部点击防误关状态机 (IA-07, IA-08, IA-09)
      captureSupervisor.on('foreground_changed', (msg: ForegroundChangedMessage) => {
        this.handleForegroundChanged(msg);
      });
      captureSupervisor.on('dot_hidden', (msg: DotHiddenMessage) => {
        if (msg.reason === 'outside_click') {
          this.handleOutsideClick();
        }
      });
    } catch (err) {
      this.logger.warn('Failed to attach captureSupervisor listeners:', err);
    }

    // 4. 监听应用内窗口获焦联动（如主窗口获焦，防误关开启保留，关闭则隐藏）
    electronApp.on('browser-window-focus', (_event, focusedWin) => {
      if (getWindowName(focusedWin) === WINDOW_IDS.HOME) {
        this.handleHomeWindowFocus();
      }
    });

    electronApp.on('will-quit', () => {
      try {
        globalShortcut.unregister('Alt+W');
      } catch {
        // ignore
      }
    });
  }

  /**
   * 创建或复用独立的 400×280 固定视口置顶原生无边框 Card BrowserWindow (RC-01 / RC-03)
   */
  async createWindow(): Promise<BrowserWindow> {
    const existing = getWindow(WINDOW_IDS.CARD);
    if (existing && !existing.isDestroyed()) {
      return existing;
    }

    this.logger.info('Creating Card browser window (400x280 native frameless alwaysOnTop)');

    const primaryDisplay = screen.getPrimaryDisplay();
    const initialBounds = calculateCardBounds({
      selectionRect: null,
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
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
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

    // 焦点转移与失焦防闪退监控 (RC-01 / RC-15)
    browserWindow.on('blur', () => {
      this.handleWindowBlur('raw_blur');
    });

    // 仅记录用户手动拖拽坐标，废除松手强行吸附回弹 (RC-13)
    browserWindow.on('moved', () => {
      if (browserWindow.isDestroyed()) return;
      const currentBounds = browserWindow.getBounds();
      this.lastDraggedPosition = { x: currentBounds.x, y: currentBounds.y };
    });

    attachWindowsWindowRepaint(browserWindow);

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
    this.logger.info(
      `showCard: action=${action.action}, text="${action.text}", mode=${action.mode}`,
    );
    // 先写入 pendingAction，防止 createWindow() 内部 loadURL 完成触发 did-finish-load 时尚未赋值
    this.pendingAction = action;
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
      workArea: targetDisplay.workArea,
      lastDraggedPosition: this.lastDraggedPosition,
    });

    win.setPosition(bounds.x, bounds.y);

    // 状态机记录源进程信息
    this.stateMachine.onOpen({
      processName: action.selection?.processName,
      processId: action.selection?.processId,
    });

    if (win.webContents.isLoading()) {
      // 首次加载尚未完成，等待首帧渲染就绪后展示，动作由 did-finish-load 统一消费 pendingAction 派发
      win.once('ready-to-show', () => {
        if (!win.isDestroyed()) {
          win.showInactive();
        }
      });
      return;
    }

    win.showInactive();
    if (this.pendingAction) {
      const nextAction = this.pendingAction;
      this.pendingAction = null;
      sendToWindow(WINDOW_IDS.CARD, IPC_CHANNELS.CARD_EVENT_ACTION, nextAction);
    }
  }

  /**
   * 隐藏卡片窗口并可选择性中止进行中的请求 (RC-14)
   */
  hideCard(abort = true): void {
    this.logger.info(`hideCard: abort=${abort}`);
    this.pendingAction = null;
    const win = getWindow(WINDOW_IDS.CARD);
    if (win && !win.isDestroyed()) {
      win.hide();
    }
    this.stateMachine.onCloseButton();
    if (abort) {
      abortTranslationsBySource('card');
    }
  }

  /**
   * 切换防误关状态 (RC-04 / RC-14)
   */
  setPin(pin: boolean): void {
    this.stateMachine.setPin(pin);
    this.logger.info('Card pin status toggled:', {
      isPinned: this.stateMachine.getPin(),
    });
  }

  getPinStatus(): boolean {
    return this.stateMachine.getPin();
  }

  /**
   * 在主窗口打开当前内容并隐藏卡片 (RC-18 / IA-25)
   */
  openInHome(data?: unknown): void {
    const action = this.stateMachine.onOpenInHome();
    this.hideCard(action.shouldAbortRequest);
    const homeModule = getHomeWindowModule();
    if (homeModule) {
      homeModule
        .restoreOrCreateWindow(true)
        .then((win) => {
          if (win && !win.isDestroyed() && data) {
            sendToWindow(WINDOW_IDS.HOME, IPC_CHANNELS.CARD_OPEN_IN_HOME, data);
          }
        })
        .catch((err) => {
          this.logger.error('Failed to restore home window from card:', err);
        });
    }
  }

  /**
   * 外部点击事件处理 (IA-07 / IA-08)
   */
  handleOutsideClick(): void {
    const action = this.stateMachine.onOutsideClick();
    this.logger.info(
      `handleOutsideClick: shouldClose=${action.shouldClose}, reason=${action.reason}`,
    );
    if (action.shouldClose) {
      this.hideCard(action.shouldAbortRequest);
    }
  }

  /**
   * 前台应用切换事件处理 (IA-09)
   */
  handleForegroundChanged(fg: ForegroundProcessInfo | ForegroundChangedMessage): void {
    const action = this.stateMachine.onForegroundChanged(fg);
    if (action.shouldClose) {
      this.hideCard(action.shouldAbortRequest);
    }
  }

  /**
   * 主窗口聚焦联动处理 (RC-14 / IA-07 / IA-08)
   */
  handleHomeWindowFocus(): void {
    const action = this.stateMachine.onHomeWindowFocused();
    if (action.shouldClose) {
      this.hideCard(action.shouldAbortRequest);
    }
  }

  /**
   * 焦点转移 / 失焦防闪退监控 (RC-01 / RC-15 防闪退红线)
   */
  handleWindowBlur(reason?: BlurReason): void {
    const action = this.stateMachine.onWindowBlur(reason);
    if (action.shouldClose) {
      this.hideCard(action.shouldAbortRequest);
    }
  }

  /**
   * 获取底层状态机实例（便于单测与状态诊断）
   */
  getStateMachine(): CardAntiCloseStateMachine {
    return this.stateMachine;
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
    this.logger.info(
      `handleDotClicked: text="${payload.text}", pid=${payload.processId}, proc=${payload.processName}`,
    );
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
