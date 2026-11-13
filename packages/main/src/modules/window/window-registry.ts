import type { WindowId } from '@app/shared/constants/windows';
import type { BrowserWindow } from 'electron';
import { trackWindowLifecycle } from '../../telemetry/window-tracer';
import { getLogManager } from '../log.module';

const registry = new Map<WindowId, BrowserWindow>();
const reverseRegistry = new Map<BrowserWindow, WindowId>();

export function registerWindow(id: WindowId, win: BrowserWindow): void {
  registry.set(id, win);
  reverseRegistry.set(win, id);
  trackWindowLifecycle(id, win);
  win.on('closed', () => {
    reverseRegistry.delete(win);
    // 按实例注销，防止旧引用覆盖新实例
    if (registry.get(id) === win) {
      registry.delete(id);
    }
    // 同步清理动态窗口的 logger 实例与文件流
    getLogManager().removeWindowLogger(id);
  });
}

export function forgetWindow(id: WindowId, win?: BrowserWindow): void {
  if (win) {
    reverseRegistry.delete(win);
    if (registry.get(id) === win) {
      registry.delete(id);
    }
  } else {
    const existing = registry.get(id);
    if (existing) {
      reverseRegistry.delete(existing);
    }
    registry.delete(id);
  }
}

export function getWindow(id: WindowId): BrowserWindow | undefined {
  const win = registry.get(id);
  if (win && !win.isDestroyed()) {
    return win;
  }
  return undefined;
}

export function getWindowName(win: BrowserWindow): WindowId | undefined {
  return reverseRegistry.get(win);
}

export function sendToWindow(id: WindowId, channel: string, payload: unknown): boolean {
  const win = getWindow(id);
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
    return true;
  }
  return false;
}

export function broadcast(channel: string, payload: unknown): void {
  for (const [, win] of registry) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}
