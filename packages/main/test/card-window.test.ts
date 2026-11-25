import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import {
  CARD_WINDOW_HEIGHT,
  CARD_WINDOW_MAX_WORK_AREA_RATIO,
  CARD_WINDOW_WIDTH,
} from '@app/shared/constants/window-geometry';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => {
  const registeredIpcHandlers = new Map<string, (...args: unknown[]) => unknown>();
  const browserWindowInstances: Array<{
    options: Record<string, unknown>;
    listeners: Map<string, Array<(...args: unknown[]) => void>>;
    bounds: { x: number; y: number; width: number; height: number };
    setBounds: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    setPosition: ReturnType<typeof vi.fn>;
  }> = [];

  class MockBrowserWindow {
    options: Record<string, unknown>;
    listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    bounds: { x: number; y: number; width: number; height: number };
    webContents = {
      on: vi.fn(),
      once: vi.fn(),
      isLoading: vi.fn(() => false),
      isDestroyed: vi.fn(() => false),
      invalidate: vi.fn(),
      openDevTools: vi.fn(),
      send: vi.fn(),
    };

    setBounds = vi.fn((next: { x: number; y: number; width: number; height: number }) => {
      this.bounds = { ...next };
    });

    setSize = vi.fn((width: number, height: number) => {
      this.bounds = { ...this.bounds, width, height };
    });

    setPosition = vi.fn((x: number, y: number) => {
      this.bounds = { ...this.bounds, x, y };
    });

    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.bounds = {
        x: Number(options.x ?? 0),
        y: Number(options.y ?? 0),
        width: Number(options.width ?? 400),
        height: Number(options.height ?? 280),
      };
      browserWindowInstances.push(this);
    }

    on(event: string, listener: (...args: unknown[]) => void) {
      const list = this.listeners.get(event) ?? [];
      list.push(listener);
      this.listeners.set(event, list);
      return this;
    }

    once(event: string, listener: (...args: unknown[]) => void) {
      return this.on(event, listener);
    }

    removeListener(event: string, listener: (...args: unknown[]) => void) {
      const list = this.listeners.get(event);
      if (list) {
        this.listeners.set(
          event,
          list.filter((fn) => fn !== listener),
        );
      }
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const listener of [...(this.listeners.get(event) ?? [])]) {
        listener(...args);
      }
    }

    getBounds() {
      return { ...this.bounds };
    }

    isDestroyed() {
      return false;
    }

    isVisible() {
      return true;
    }

    showInactive() {}
    hide() {}
    loadURL = vi.fn(async () => {});
  }

  return {
    registeredIpcHandlers,
    browserWindowInstances,
    MockBrowserWindow,
  };
});

vi.mock('electron', () => ({
  app: {
    getName: vi.fn(() => 'Snapword'),
    getPath: vi.fn(() => '/tmp/snapword-test'),
    getVersion: vi.fn(() => '0.1.0'),
    whenReady: vi.fn(async () => {}),
    on: vi.fn(),
  },
  BrowserWindow: electronMocks.MockBrowserWindow,
  clipboard: {
    writeText: vi.fn(),
  },
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      electronMocks.registeredIpcHandlers.set(channel, handler);
    }),
  },
  net: {
    fetch: vi.fn(),
  },
  nativeTheme: {
    themeSource: 'light',
    shouldUseDarkColors: false,
    on: vi.fn(),
  },
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    })),
    getDisplayMatching: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    })),
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    })),
    getCursorScreenPoint: vi.fn(() => ({ x: 100, y: 100 })),
  },
}));

vi.mock('../src/modules/config.module', () => ({
  getAppConfigStore: () => ({
    get: () => 'light',
  }),
}));

vi.mock('../src/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/env')>();
  return {
    ...actual,
    getPackedEnvArgument: () => '--snapword-env=mock',
  };
});

import { registerCardControllers } from '../src/controllers/card.controller';
import { calculateCardBounds, type RectangleLike } from '../src/modules/window/card-geometry';
import { isEnglishText, resolveSelectionDispatch } from '../src/modules/window/card-shortcut';
import { CardWindowModule } from '../src/modules/window/card-window.module';

describe('Card Window Subsystem (Slice-04 / ADR-0006)', () => {
  const mockWorkArea: RectangleLike = {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
  };

  beforeEach(() => {
    const instances = electronMocks.browserWindowInstances.splice(0);
    for (const win of instances) {
      win.emit('closed');
    }
    electronMocks.registeredIpcHandlers.clear();
  });

  describe('CardWindowModule 原生无边框窗口装配与废除 resize/rebound', () => {
    it('创建 BrowserWindow 时使用 transparent:false, hasShadow:true, frame:false 与 400x280 固定尺寸', async () => {
      const module = new CardWindowModule({
        initConfig: {
          preload: { path: '/fake/preload.cjs' },
          windows: {
            home: new URL('http://localhost:3000/home'),
            updater: new URL('http://localhost:3000/updater'),
            card: new URL('http://localhost:3000/card'),
          },
        },
      });

      await module.createWindow();
      expect(electronMocks.browserWindowInstances).toHaveLength(1);

      const instance = electronMocks.browserWindowInstances[0];
      expect(instance.options.transparent).toBe(false);
      expect(instance.options.hasShadow).toBe(true);
      expect(instance.options.frame).toBe(false);
      expect(instance.options.resizable).toBe(false);
      expect(instance.options.alwaysOnTop).toBe(true);
      expect(instance.options.skipTaskbar).toBe(true);
      expect(instance.options.width).toBe(CARD_WINDOW_WIDTH);
      expect(instance.options.height).toBe(CARD_WINDOW_HEIGHT);
      expect(instance.options.width).toBe(400);
      expect(instance.options.height).toBe(280);
      expect(instance.options.backgroundColor).toBe('#F0EDE2');
    });

    it('moved 事件仅 1:1 记录用户拖拽坐标，不触发任何 setBounds 回弹修正', async () => {
      const module = new CardWindowModule({
        initConfig: {
          preload: { path: '/fake/preload.cjs' },
          windows: {
            home: new URL('http://localhost:3000/home'),
            updater: new URL('http://localhost:3000/updater'),
            card: new URL('http://localhost:3000/card'),
          },
        },
      });

      await module.createWindow();
      const instance = electronMocks.browserWindowInstances[0];

      // 模拟用户将窗口紧贴屏幕左下角甚至部分贴边
      instance.bounds = { x: 0, y: 760, width: 400, height: 280 };
      instance.emit('moved');

      expect(instance.setBounds).not.toHaveBeenCalled();
      expect(instance.setSize).not.toHaveBeenCalled();

      // 再次唤起卡片时应 1:1 沿用 { x: 0, y: 760 }
      await module.showCard({
        action: 'translate',
        mode: 'word',
        text: 'electron',
      });
      expect(instance.setPosition).toHaveBeenCalledWith(0, 760);
    });

    it('不再声明或注册 card:resize IPC 通道，且模块不存在 resizeCard 调度', () => {
      expect('CARD_RESIZE' in IPC_CHANNELS).toBe(false);
      expect(Object.values(IPC_CHANNELS)).not.toContain('card:resize');

      registerCardControllers();
      expect(electronMocks.registeredIpcHandlers.has('card:resize')).toBe(false);
      expect(electronMocks.registeredIpcHandlers.has(IPC_CHANNELS.CARD_HIDE)).toBe(true);
      expect(electronMocks.registeredIpcHandlers.has(IPC_CHANNELS.CARD_OPEN_IN_HOME)).toBe(true);
      expect('resizeCard' in CardWindowModule.prototype).toBe(false);
    });
  });

  describe('DIP 坐标计算与多屏/越界翻转 (RC-02/RC-03)', () => {
    it('常规选区默认定位在选区右下方 8px 处 (Priority 1)', () => {
      const selection = { x: 200, y: 200, width: 80, height: 24 };
      const bounds = calculateCardBounds({
        selectionRect: selection,
        workArea: mockWorkArea,
      });

      expect(bounds.x).toBe(200 + 80 + 8); // 288
      expect(bounds.y).toBe(200 + 24 + 8); // 232
      expect(bounds.width).toBe(400);
      expect(bounds.height).toBe(280);
    });

    it('右下空间不足时，自动向内翻转至下方居中 (Priority 2)', () => {
      // 靠近屏幕右边界 (x: 1600)，右下放不下 400px，但下方居中可放下
      const selection = { x: 1600, y: 200, width: 100, height: 24 };
      const bounds = calculateCardBounds({
        selectionRect: selection,
        workArea: mockWorkArea,
      });

      // 居中于选区 (1600 + 50 - 200 = 1450)
      expect(bounds.x).toBe(1450);
      expect(bounds.y).toBe(200 + 24 + 8);
    });

    it('下方空间不足时，自动向上翻转至选区上方居中 (Priority 3)', () => {
      // 靠近屏幕底部 (y: 950)，下方放不下 280px，上方居中可放下
      const selection = { x: 1600, y: 950, width: 100, height: 24 };
      const bounds = calculateCardBounds({
        selectionRect: selection,
        workArea: mockWorkArea,
      });

      expect(bounds.x).toBe(1450);
      expect(bounds.y).toBe(950 - 8 - 280); // 662
    });

    it('四周均放不下时，翻转至屏幕右侧固定位置 (Priority 5)', () => {
      // 极端靠右边界 (x: 1800)，上方下方居中均超出屏幕
      const selection = { x: 1800, y: 950, width: 100, height: 24 };
      const bounds = calculateCardBounds({
        selectionRect: selection,
        workArea: mockWorkArea,
      });

      // 屏幕右侧固定 16px: 1920 - 400 - 16 = 1504
      expect(bounds.x).toBe(1504);
    });

    it('极端小屏下高度受控于 45% 工作区高度上限', () => {
      const tinyWorkArea: RectangleLike = { x: 0, y: 0, width: 800, height: 500 };
      const selection = { x: 100, y: 100, width: 80, height: 24 };
      const bounds = calculateCardBounds({
        selectionRect: selection,
        workArea: tinyWorkArea,
      });

      expect(bounds.height).toBe(Math.floor(500 * CARD_WINDOW_MAX_WORK_AREA_RATIO));
      expect(bounds.height).toBe(225);
    });
  });

  describe('全局热键 Alt+W 与选区校验调度 (FR-11, RC-09, IA-23/24)', () => {
    it('无选区文本时直接返回内联提示「未获取到选中文本」，不发请求', () => {
      const dispatch = resolveSelectionDispatch('');
      expect(dispatch.action).toBe('notice');
      expect(dispatch.notice).toBe('未获取到选中文本');
    });

    it('非英文文本（英文占比 < 30%）直接返回「当前仅支持英文翻译」，不发请求', () => {
      const dispatch = resolveSelectionDispatch('这是一段测试文本');
      expect(dispatch.action).toBe('notice');
      expect(dispatch.notice).toBe('当前仅支持英文翻译');
    });

    it('合法英文单词自动推断为 word 模式', () => {
      const dispatch = resolveSelectionDispatch('electron');
      expect(dispatch.action).toBe('translate');
      expect(dispatch.mode).toBe('word');
    });

    it('合法英文长句自动推断为 sentence 模式', () => {
      const dispatch = resolveSelectionDispatch(
        'Build modern desktop applications with Electron and React.',
      );
      expect(dispatch.action).toBe('translate');
      expect(dispatch.mode).toBe('sentence');
    });

    it('英文占比 >= 30% 的中英混排能够通过英文校验', () => {
      expect(isEnglishText('React 19 是现代前端框架')).toBe(true);
    });
  });
});
