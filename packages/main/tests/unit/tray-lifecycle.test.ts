import { EventEmitter } from 'node:events';
import { appLifecycle } from '@app/main/lifecycle';
import { ApplicationTerminatorOnLastWindowClose } from '@app/main/modules/auto-terminate.module';
import * as configModule from '@app/main/modules/config.module';
import { TrayManager } from '@app/main/modules/tray.module';
import * as windowIndexModule from '@app/main/modules/window/index.module';
import * as windowRegistry from '@app/main/modules/window/window-registry';
import { WINDOW_IDS } from '@app/shared/constants/windows';
import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Tray & Window Destroy Lifecycle', () => {
  beforeEach(() => {
    appLifecycle.isQuitting = false;
  });

  afterEach(() => {
    // 断言失败时也要复位退出态，避免把 isQuitting 泄漏给后续用例
    appLifecycle.isQuitting = false;
    vi.restoreAllMocks();
  });

  describe('ApplicationTerminatorOnLastWindowClose', () => {
    it('does not quit when minimizeToTray is true and not quitting', () => {
      const mockApp = new EventEmitter() as unknown as Electron.App;
      (mockApp as unknown as { quit: () => void }).quit = vi.fn();

      vi.spyOn(configModule, 'getAppConfigStore').mockReturnValue({
        get: (key: string) => key === 'minimizeToTray',
      } as unknown as ReturnType<typeof configModule.getAppConfigStore>);

      const terminator = new ApplicationTerminatorOnLastWindowClose();
      terminator.enable({
        app: mockApp,
      } as unknown as import('@app/main/ModuleContext').ModuleContext);

      mockApp.emit('window-all-closed');

      expect((mockApp as unknown as { quit: () => void }).quit).not.toHaveBeenCalled();
    });

    it('quits on window-all-closed when minimizeToTray is false', () => {
      const mockApp = new EventEmitter() as unknown as Electron.App;
      (mockApp as unknown as { quit: () => void }).quit = vi.fn();

      vi.spyOn(configModule, 'getAppConfigStore').mockReturnValue({
        get: () => false,
      } as unknown as ReturnType<typeof configModule.getAppConfigStore>);

      const terminator = new ApplicationTerminatorOnLastWindowClose();
      terminator.enable({
        app: mockApp,
      } as unknown as import('@app/main/ModuleContext').ModuleContext);

      mockApp.emit('window-all-closed');

      expect((mockApp as unknown as { quit: () => void }).quit).toHaveBeenCalled();
    });

    it('quits on window-all-closed when appLifecycle.isQuitting is true', () => {
      appLifecycle.isQuitting = true;
      const mockApp = new EventEmitter() as unknown as Electron.App;
      (mockApp as unknown as { quit: () => void }).quit = vi.fn();

      vi.spyOn(configModule, 'getAppConfigStore').mockReturnValue({
        get: (key: string) => key === 'minimizeToTray',
      } as unknown as ReturnType<typeof configModule.getAppConfigStore>);

      const terminator = new ApplicationTerminatorOnLastWindowClose();
      terminator.enable({
        app: mockApp,
      } as unknown as import('@app/main/ModuleContext').ModuleContext);

      mockApp.emit('window-all-closed');

      expect((mockApp as unknown as { quit: () => void }).quit).toHaveBeenCalled();
    });
  });

  describe('TrayManager window interaction', () => {
    it('recreates and restores window if window is destroyed or not present', async () => {
      vi.spyOn(windowRegistry, 'getWindow').mockReturnValue(undefined);

      const restoreOrCreateWindowMock = vi.fn().mockResolvedValue({} as BrowserWindow);
      vi.spyOn(windowIndexModule, 'getWindowManager').mockReturnValue({
        restoreOrCreateWindow: restoreOrCreateWindowMock,
      } as unknown as windowIndexModule.WindowManager);

      const trayManager = new TrayManager();
      trayManager.restoreMainWindow();

      expect(restoreOrCreateWindowMock).toHaveBeenCalledWith(true);
    });

    it('focuses existing window on toggleMainWindow without hiding it', () => {
      const mockWin = {
        isDestroyed: () => false,
        isVisible: () => true,
        isMinimized: () => false,
        hide: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
      } as unknown as BrowserWindow;

      vi.spyOn(windowRegistry, 'getWindow').mockImplementation((id) =>
        id === WINDOW_IDS.HOME ? mockWin : undefined,
      );

      const trayManager = new TrayManager();
      trayManager.toggleMainWindow();

      expect(mockWin.focus).toHaveBeenCalled();
      expect(mockWin.hide).not.toHaveBeenCalled();
    });

    it('restores and shows existing window if minimized', () => {
      const mockWin = {
        isDestroyed: () => false,
        isVisible: () => false,
        isMinimized: () => true,
        restore: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
      } as unknown as BrowserWindow;

      vi.spyOn(windowRegistry, 'getWindow').mockImplementation((id) =>
        id === WINDOW_IDS.HOME ? mockWin : undefined,
      );

      const trayManager = new TrayManager();
      trayManager.restoreMainWindow();

      expect(mockWin.restore).toHaveBeenCalled();
      expect(mockWin.show).toHaveBeenCalled();
      expect(mockWin.focus).toHaveBeenCalled();
    });
  });
});
