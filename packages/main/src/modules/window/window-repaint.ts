import type { BrowserWindow } from 'electron';

/**
 * win32 无边框窗口重绘守护：消除跨屏拖拽、Snap 贴靠、锁屏唤醒后的黑边残影。
 *
 * 仅监听低频事件——'resized'（尺寸调整结束，严禁改用高频 'resize'）
 * 与 'show'（最小化恢复 / 锁屏唤醒）；每次触发立即补绘一帧，
 * 再排 32ms 定时器补绘第二帧（有界双帧，非纯防抖）。
 * 全生命周期常驻挂载，不得移除（specs/first-screen-loading.md §6）。
 */

// 私有常量
const SECOND_REPAINT_DELAY_MS = 32;

export function attachWindowsWindowRepaint(win: BrowserWindow): void {
  if (process.platform !== 'win32') {
    return;
  }

  let repaintTimer: NodeJS.Timeout | null = null;

  // 双判空守卫：窗口或 webContents 任一已销毁即跳过
  const repaint = () => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) {
      return;
    }
    win.webContents.invalidate();
  };

  const scheduleRepaint = () => {
    repaint();
    if (repaintTimer) {
      clearTimeout(repaintTimer);
    }
    repaintTimer = setTimeout(() => {
      // 先清引用防 stale 句柄重排；窗口销毁安全由 repaint() 双判空兜底
      repaintTimer = null;
      repaint();
    }, SECOND_REPAINT_DELAY_MS);
  };

  win.on('resized', scheduleRepaint);
  win.on('show', scheduleRepaint);
}
