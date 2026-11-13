import type { BrowserWindow } from 'electron';
import { getTracer } from './tracer';

export const WINDOW_TELEMETRY_EVENTS = {
  CREATED: 'window.created',
  DOM_READY: 'window.dom_ready',
  READY_TO_SHOW: 'window.ready_to_show',
  CLOSED: 'window.closed',
} as const;

/**
 * 监听并记录 BrowserWindow 生命周期 Span 与关键事件 (Spec §4.4)
 * 采用双跨度策略：
 * 1. window.initialization: 创建 -> ready-to-show，立即可视化冷启动耗时
 * 2. window.lifecycle: 创建 -> closed，追踪窗口完整生命周期
 */
export function trackWindowLifecycle(name: string, win: BrowserWindow): void {
  const winId = win.id;
  const tracer = getTracer();

  // 1. 窗口完整生命周期 Span
  const lifecycleSpan = tracer.startManualSpan('window.lifecycle', {
    attributes: {
      'window.name': name,
      'window.id': winId,
    },
  });
  lifecycleSpan.addEvent(WINDOW_TELEMETRY_EVENTS.CREATED);

  // 2. 窗口启动就绪阶段 Span
  const initSpan = tracer.startManualSpan('window.initialization', {
    attributes: {
      'window.name': name,
      'window.id': winId,
    },
  });
  initSpan.addEvent(WINDOW_TELEMETRY_EVENTS.CREATED);

  let initEnded = false;

  const onDomReady = () => {
    lifecycleSpan.addEvent(WINDOW_TELEMETRY_EVENTS.DOM_READY);
    if (!initEnded) {
      initSpan.addEvent(WINDOW_TELEMETRY_EVENTS.DOM_READY);
    }
  };

  const onReadyToShow = () => {
    lifecycleSpan.addEvent(WINDOW_TELEMETRY_EVENTS.READY_TO_SHOW);
    if (!initEnded) {
      initEnded = true;
      initSpan.addEvent(WINDOW_TELEMETRY_EVENTS.READY_TO_SHOW);
      initSpan.end('OK');
    }
  };

  const onClosed = () => {
    if (!initEnded) {
      initEnded = true;
      initSpan.end('OK');
    }
    lifecycleSpan.addEvent(WINDOW_TELEMETRY_EVENTS.CLOSED);
    lifecycleSpan.end('OK');

    // 及时移除监听器，杜绝内存泄漏
    try {
      if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
        win.webContents.removeListener('dom-ready', onDomReady);
      }
    } catch {
      // 忽略已销毁的实例
    }
    win.removeListener('ready-to-show', onReadyToShow);
    win.removeListener('closed', onClosed);
  };

  if (win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.on('dom-ready', onDomReady);
  }
  win.once('ready-to-show', onReadyToShow);
  win.once('closed', onClosed);
}
