import { ErrorCode } from '@app/shared/constants/error-codes';
import type { LogInput, PerformActionInput } from '@app/shared/schemas/diagnostics';
import type { ActionResult } from '@app/shared/types/diagnostics';
import { BrowserWindow, shell } from 'electron';
import { RENDER_LOG_THROTTLE_LIMIT, RENDER_LOG_THROTTLE_WINDOW_MS } from '../constants/logging';
import { AppError } from '../errors/AppError';
import { getLogManager } from '../modules/log.module';
import { isAllowedExternalUrl } from '../modules/security/external-urls';

/**
 * 渲染日志滑窗节流器（D3）：每调用方每秒准入上限，超限静默丢弃并延迟汇总一条告警。
 * 窗口内前 limit 条准入，后续丢弃；丢弃计数经 windowMs 后由 onAggregate 汇总回调一次
 * （窗口滑过自动恢复，无需重置）。
 */
export function createRenderLogThrottle(
  onAggregate: (key: string, dropped: number) => void,
  { limit = RENDER_LOG_THROTTLE_LIMIT, windowMs = RENDER_LOG_THROTTLE_WINDOW_MS } = {},
): (key: string) => boolean {
  const hits = new Map<string, number[]>();
  const droppedCounts = new Map<string, number>();
  const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const flush = (key: string): void => {
    clearTimeout(flushTimers.get(key));
    flushTimers.delete(key);
    const dropped = droppedCounts.get(key) ?? 0;
    droppedCounts.delete(key);
    if (dropped > 0) {
      onAggregate(key, dropped);
    }
  };

  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      droppedCounts.set(key, (droppedCounts.get(key) ?? 0) + 1);
      if (!flushTimers.has(key)) {
        flushTimers.set(
          key,
          setTimeout(() => flush(key), windowMs),
        );
      }
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}

export class DiagnosticsService {
  private readonly allowRenderLog = createRenderLogThrottle((key, dropped) => {
    getLogManager()
      .scoped('DiagnosticsService')
      .warn(`Dropped ${dropped} renderer log line(s) in 1s window (${key})`);
  });

  logMessage(input: LogInput, windowName?: string, webContentsId?: number): void {
    const key = webContentsId === undefined ? `win:${windowName || 'home'}` : `wc#${webContentsId}`;
    if (!this.allowRenderLog(key)) return;
    getLogManager().logRendererMessage(
      input.level,
      input.message,
      input.args,
      windowName,
      input.traceId,
      input.spanId,
    );
  }

  async openLogFolder(): Promise<{ success: boolean; path: string }> {
    await getLogManager().openLogFolder();
    return { success: true, path: getLogManager().getLogDirectory() };
  }

  async performAction(input: PerformActionInput): Promise<ActionResult> {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

    if (input.action === 'toggleDevTools') {
      if (!window) {
        throw new AppError('No active window found to toggle DevTools', ErrorCode.WINDOW_NOT_FOUND);
      }
      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools();
        return { success: true, message: 'DevTools closed' };
      } else {
        window.webContents.openDevTools();
        return { success: true, message: 'DevTools opened' };
      }
    }

    if (input.action === 'openUrl' && input.url) {
      const parsed = new URL(input.url);
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        throw new AppError(
          'Invalid URL protocol. Only http: and https: are allowed.',
          ErrorCode.INVALID_PROTOCOL,
        );
      }
      if (!isAllowedExternalUrl(input.url)) {
        throw new AppError(`Disallowed external URL: ${input.url}`, ErrorCode.INVALID_ARGUMENT);
      }
      await shell.openExternal(input.url);
      return { success: true, message: `Opened ${input.url}` };
    }

    return { success: false, message: 'No action performed' };
  }
}

export const diagnosticsService = new DiagnosticsService();
