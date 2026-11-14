import { ErrorCode } from '@app/shared/constants/error-codes';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { deleteHistoryInputSchema, type TranslationHistoryItem } from '@app/shared/schemas/history';
import type { Result } from '@app/shared/types/result';
import { translationHistoryService } from '../services/history.service';
import { handleTraced } from '../telemetry/ipc-tracer';
import { catchToResult, failResult, successResult } from './utils';

export function registerHistoryControllers(): void {
  handleTraced(IPC_CHANNELS.HISTORY_GET, async (): Promise<Result<TranslationHistoryItem[]>> => {
    try {
      const items = translationHistoryService.getRecords();
      return successResult(items);
    } catch (err) {
      return catchToResult(err);
    }
  });

  handleTraced(
    IPC_CHANNELS.HISTORY_DELETE,
    async (_event, rawInput: unknown): Promise<Result<{ success: boolean }>> => {
      const parseResult = deleteHistoryInputSchema.safeParse(rawInput ?? {});
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        const success = translationHistoryService.deleteRecord(parseResult.data.id);
        return successResult({ success });
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(IPC_CHANNELS.HISTORY_CLEAR, async (): Promise<Result<{ success: boolean }>> => {
    try {
      translationHistoryService.clearRecords();
      return successResult({ success: true });
    } catch (err) {
      return catchToResult(err);
    }
  });
}
