import { ErrorCode } from '@app/shared/constants/error-codes';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { logInputSchema, performActionInputSchema } from '@app/shared/schemas/diagnostics';
import type { ActionResult, OpenLogFolderResult } from '@app/shared/types/diagnostics';
import type { Result } from '@app/shared/types/result';
import { BrowserWindow, ipcMain } from 'electron';
import { getWindowName } from '../modules/window/window-registry';
import { diagnosticsService } from '../services/diagnostics.service';
import { handleTraced } from '../telemetry/ipc-tracer';
import { catchToResult, failResult, successResult } from './utils';

export function registerDiagnosticsControllers(): void {
  // 架构豁免：DIAGNOSTICS_LOG 属于日志落盘传输管道本体，禁止走 handleTraced 追踪，
  // 避免每行日志落盘产生 span 与 trace 跟踪日志导致严重递归自噪。
  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_LOG,
    async (event, rawInput: unknown): Promise<Result<{ success: boolean }>> => {
      const parseResult = logInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        const senderWin = event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
        const windowName = senderWin ? getWindowName(senderWin) : undefined;
        diagnosticsService.logMessage(
          parseResult.data,
          windowName,
          senderWin?.id ?? event.sender?.id,
        );
        return successResult({ success: true });
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.DIAGNOSTICS_OPEN_LOG_FOLDER,
    async (): Promise<Result<OpenLogFolderResult>> => {
      try {
        const res = await diagnosticsService.openLogFolder();
        return successResult(res);
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.DIAGNOSTICS_PERFORM_ACTION,
    async (_event, rawInput: unknown): Promise<Result<ActionResult>> => {
      const parseResult = performActionInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        const res = await diagnosticsService.performAction(parseResult.data);
        return successResult(res);
      } catch (err) {
        return catchToResult(err);
      }
    },
  );
}
