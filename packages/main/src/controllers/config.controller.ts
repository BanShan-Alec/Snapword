import { ErrorCode } from '@app/shared/constants/error-codes';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { type AppConfig, updateConfigInputSchema } from '@app/shared/schemas/config';
import type { Result } from '@app/shared/types/result';
import { broadcast } from '../modules/window/window-registry';
import { configService } from '../services/config.service';
import { handleTraced } from '../telemetry/ipc-tracer';
import { catchToResult, failResult, successResult } from './utils';

export function registerConfigControllers(): void {
  handleTraced(IPC_CHANNELS.CONFIG_GET, async (): Promise<Result<AppConfig>> => {
    try {
      return successResult(configService.getConfig());
    } catch (err) {
      return catchToResult(err);
    }
  });

  handleTraced(
    IPC_CHANNELS.CONFIG_UPDATE,
    async (_event, rawInput: unknown): Promise<Result<AppConfig>> => {
      const parseResult = updateConfigInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        const updated = configService.updateConfig(parseResult.data);
        broadcast(IPC_CHANNELS.CONFIG_EVENT_CHANGED, updated);
        return successResult(updated);
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(IPC_CHANNELS.CONFIG_RESET, async (): Promise<Result<AppConfig>> => {
    try {
      const reset = configService.resetConfig();
      broadcast(IPC_CHANNELS.CONFIG_EVENT_CHANGED, reset);
      return successResult(reset);
    } catch (err) {
      return catchToResult(err);
    }
  });
}
