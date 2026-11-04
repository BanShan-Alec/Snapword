import { appLifecycle } from '@app/main/lifecycle';
import { TrayManager } from '@app/main/modules/tray.module';
import * as windowIndexModule from '@app/main/modules/window/index.module';
import * as windowRegistry from '@app/main/modules/window/window-registry';
import { WINDOW_IDS } from '@app/shared/constants/windows';
import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('TrayManager 窗口交互', () => {
  beforeEach(() => {
    appLifecycle.isQuitting = false;
  });

  afterEach(() => {
    // 断言失败时也要复位退出态，避免把 isQuitting 泄漏给后续用例
    appLifecycle.isQuitting = false;
    vi.restoreAllMocks();
  });

  it('窗口不存在时经 restoreOrCreateWindow 重建并拉起主窗口', async () => {
    vi.spyOn(windowRegistry, 'getWindow').mockReturnValue(undefined);

    const restoreOrCreateWindowMock = vi.fn().mockResolvedValue({} as BrowserWindow);
    vi.spyOn(windowIndexModule, 'getWindowManager').mockReturnValue({
      restoreOrCreateWindow: restoreOrCreateWindowMock,
    } as unknown as windowIndexModule.WindowManager);

    const trayManager = new TrayManager();
    trayManager.restoreMainWindow();

    expect(restoreOrCreateWindowMock).toHaveBeenCalledWith(true);
  });

  it('窗口在场时聚焦已有主窗口，不销毁不隐藏', () => {
    const mockWin = {
      isDestroyed: () => false,
      isVisible: () => true,
      isMinimized: () => false,
      hide: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      destroy: vi.fn(),
    } as unknown as BrowserWindow;

    vi.spyOn(windowRegistry, 'getWindow').mockImplementation((id) =>
      id === WINDOW_IDS.HOME ? mockWin : undefined,
    );

    const trayManager = new TrayManager();
    trayManager.restoreMainWindow();

    expect(mockWin.focus).toHaveBeenCalled();
    expect(mockWin.hide).not.toHaveBeenCalled();
    expect(mockWin.destroy).not.toHaveBeenCalled();
  });

  it('最小化的主窗口先 restore 再 show/focus', () => {
    const mockWin = {
      isDestroyed: () => false,
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
