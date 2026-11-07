import { ErrorCode } from '@app/shared/constants/error-codes';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { WINDOW_IDS } from '@app/shared/constants/windows';
import { closeBehaviorChoiceSchema } from '@app/shared/schemas/close-behavior';
import type { Result } from '@app/shared/types/result';
import { getWindowManager } from '../modules/window/index.module';
import { getWindow } from '../modules/window/window-registry';
import { handleTraced } from '../telemetry/ipc-tracer';
import { catchToResult, failResult, successResult } from './utils';

export function registerWindowControllers(): void {
  handleTraced(
    IPC_CHANNELS.WINDOW_CLOSE_READY,
    async (_event): Promise<Result<{ success: boolean }>> => {
      const windowManager = getWindowManager();
      if (!windowManager || getWindow(WINDOW_IDS.HOME)?.webContents.id !== _event.sender.id) {
        return failResult('Close prompt is only available to the home window');
      }
      try {
        windowManager.markRendererReady();
        return successResult({ success: true });
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.WINDOW_CLOSE_RESPOND,
    async (_event, rawInput: unknown): Promise<Result<{ success: boolean }>> => {
      const parseResult = closeBehaviorChoiceSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      const windowManager = getWindowManager();
      if (!windowManager || getWindow(WINDOW_IDS.HOME)?.webContents.id !== _event.sender.id) {
        return failResult('Close prompt is only available to the home window');
      }
      try {
        await windowManager.respondCloseRequest(parseResult.data);
        return successResult({ success: true });
      } catch (err) {
        return catchToResult(err);
      }
    },
  );
}
