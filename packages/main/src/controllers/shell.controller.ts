import { existsSync } from 'node:fs';
import { ErrorCode } from '@app/shared/constants/error-codes';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { showItemInFolderInputSchema } from '@app/shared/schemas/shell';
import type { Result } from '@app/shared/types/result';
import { shell } from 'electron';
import { AppError } from '../errors/AppError';
import { isAllowedExternalUrl } from '../modules/security/external-urls';
import { handleTraced } from '../telemetry/ipc-tracer';
import { catchToResult, failResult, successResult } from './utils';

export function registerShellControllers(): void {
  handleTraced(
    IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER,
    async (_event, rawInput: unknown): Promise<Result<{ success: boolean }>> => {
      const parseResult = showItemInFolderInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        if (!existsSync(parseResult.data.path)) {
          throw new AppError(
            `Target path does not exist: ${parseResult.data.path}`,
            ErrorCode.NOT_FOUND,
          );
        }
        shell.showItemInFolder(parseResult.data.path);
        return successResult({ success: true });
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.SHELL_OPEN_EXTERNAL,
    async (_event, url: unknown): Promise<Result<{ success: boolean }>> => {
      if (typeof url !== 'string') {
        return failResult('URL must be a string', ErrorCode.VALIDATION_ERROR);
      }
      if (!isAllowedExternalUrl(url)) {
        return failResult(`Disallowed external URL: ${url}`, ErrorCode.INVALID_ARGUMENT);
      }
      try {
        await shell.openExternal(url);
        return successResult({ success: true });
      } catch (err) {
        return catchToResult(err);
      }
    },
  );
}
