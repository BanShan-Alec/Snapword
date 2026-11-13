import { EventEmitter } from 'node:events';
import { getTracer } from '@app/main/telemetry/tracer';
import { trackWindowLifecycle } from '@app/main/telemetry/window-tracer';
import type { SpanRecord } from '@app/shared/types/telemetry';
import { describe, expect, it } from 'vitest';

class MockWebContents extends EventEmitter {
  public isDestroyed() {
    return false;
  }
}

class MockBrowserWindow extends EventEmitter {
  public id = 101;
  public webContents = new MockWebContents();
  public isDestroyed() {
    return false;
  }
}

describe('Window Tracer', () => {
  it('tracks window lifecycle events and emits dual spans', () => {
    const tracer = getTracer();
    const records: SpanRecord[] = [];
    const unsubscribe = tracer.onSpanEnd((record) => {
      records.push(record);
    });

    try {
      const mockWin = new MockBrowserWindow() as unknown as Electron.BrowserWindow;
      trackWindowLifecycle('home', mockWin);

      // 触发 dom-ready on webContents
      mockWin.webContents.emit('dom-ready');

      // 触发 ready-to-show：此时应立即落盘 window.initialization Span
      mockWin.emit('ready-to-show');

      const initRecord = records.find((record) => record.name === 'window.initialization');
      expect(initRecord).toMatchObject({
        name: 'window.initialization',
        status: 'OK',
        attributes: { 'window.name': 'home', 'window.id': 101 },
      });
      expect(initRecord?.events.map((event) => event.name)).toEqual([
        'window.created',
        'window.dom_ready',
        'window.ready_to_show',
      ]);

      // 触发 closed：此时应落盘 window.lifecycle Span 并解绑监听
      mockWin.emit('closed');

      const lifecycleRecord = records.find((record) => record.name === 'window.lifecycle');
      expect(lifecycleRecord).toMatchObject({
        name: 'window.lifecycle',
        status: 'OK',
        attributes: { 'window.name': 'home', 'window.id': 101 },
      });
      expect(lifecycleRecord?.events.map((event) => event.name)).toEqual([
        'window.created',
        'window.dom_ready',
        'window.ready_to_show',
        'window.closed',
      ]);

      // 验证监听器已被注销，防止内存泄漏
      expect(mockWin.webContents.listenerCount('dom-ready')).toBe(0);
      expect(mockWin.listenerCount('ready-to-show')).toBe(0);
      expect(mockWin.listenerCount('closed')).toBe(0);
    } finally {
      // 断言失败也必须注销，避免污染同进程内后续用例
      unsubscribe();
    }
  });
});
