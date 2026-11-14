import { ErrorCode } from '@app/shared/constants/error-codes';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { updaterMockActionSchema } from '@app/shared/schemas/updater';
import type { Result } from '@app/shared/types/result';
import type { UpdaterSnapshot } from '@app/shared/types/updater';
import { isTest } from '../env';
import { getUpdaterWindowModule } from '../modules/window/updater-window.module';
import { updaterService } from '../services/updater.service';
import { handleTraced } from '../telemetry/ipc-tracer';
import { catchToResult, failResult, successResult } from './utils';

export function registerUpdaterControllers(): void {
  handleTraced(IPC_CHANNELS.UPDATER_GET_STATE, async (): Promise<Result<UpdaterSnapshot>> => {
    try {
      return successResult(updaterService.getSnapshot());
    } catch (err) {
      return catchToResult(err);
    }
  });

  handleTraced(IPC_CHANNELS.UPDATER_CHECK, async (): Promise<Result<UpdaterSnapshot>> => {
    try {
      const snapshot = await updaterService.check();
      return successResult(snapshot);
    } catch (err) {
      return catchToResult(err);
    }
  });

  handleTraced(IPC_CHANNELS.UPDATER_DOWNLOAD, async (): Promise<Result<UpdaterSnapshot>> => {
    try {
      const snapshot = await updaterService.download();
      return successResult(snapshot);
    } catch (err) {
      return catchToResult(err);
    }
  });

  handleTraced(IPC_CHANNELS.UPDATER_CANCEL, async (): Promise<Result<UpdaterSnapshot>> => {
    try {
      const snapshot = await updaterService.cancel();
      return successResult(snapshot);
    } catch (err) {
      return catchToResult(err);
    }
  });

  handleTraced(IPC_CHANNELS.UPDATER_INSTALL, async (): Promise<Result<{ success: boolean }>> => {
    try {
      const result = await updaterService.install();
      return successResult(result);
    } catch (err) {
      return catchToResult(err);
    }
  });

  handleTraced(
    IPC_CHANNELS.UPDATER_OPEN_WINDOW,
    async (): Promise<Result<{ success: boolean }>> => {
      try {
        await getUpdaterWindowModule().show();
        return successResult({ success: true });
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.UPDATER_CLOSE_WINDOW,
    async (): Promise<Result<{ success: boolean }>> => {
      try {
        getUpdaterWindowModule().close();
        return successResult({ success: true });
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  // 测试环境 Mock 注入通道
  if (isTest) {
    handleTraced(
      IPC_CHANNELS.UPDATER_MOCK_EMIT,
      async (_event, rawInput: unknown): Promise<Result<{ success: boolean }>> => {
        const parseResult = updaterMockActionSchema.safeParse(rawInput);
        if (!parseResult.success) {
          return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
        }
        try {
          updaterService.mockEmit(parseResult.data);
          return successResult({ success: true });
        } catch (err) {
          return catchToResult(err);
        }
      },
    );
  }
}
