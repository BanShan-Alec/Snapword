import { ErrorCode } from '@app/shared/constants/error-codes';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import {
  openDirectoryInputSchema,
  openFileInputSchema,
  saveFileInputSchema,
} from '@app/shared/schemas/dialog';
import { showItemInFolderInputSchema } from '@app/shared/schemas/shell';
import type { FileDialogResult, SaveFileDialogResult } from '@app/shared/types/dialog';
import type { Result } from '@app/shared/types/result';
import { shell } from 'electron';
import { isAllowedExternalUrl } from '../modules/security/external-urls';
import { dialogService } from '../services/dialog.service';
import { handleTraced } from '../telemetry/ipc-tracer';
import { catchToResult, failResult, successResult } from './utils';

export function registerDialogControllers(): void {
  handleTraced(
    IPC_CHANNELS.DIALOG_OPEN_FILE,
    async (_event, rawInput: unknown): Promise<Result<FileDialogResult>> => {
      const parseResult = openFileInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        const res = await dialogService.openFile(parseResult.data);
        return successResult(res);
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.DIALOG_OPEN_DIRECTORY,
    async (_event, rawInput: unknown): Promise<Result<FileDialogResult>> => {
      const parseResult = openDirectoryInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        const res = await dialogService.openDirectory(parseResult.data);
        return successResult(res);
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.DIALOG_SAVE_FILE,
    async (_event, rawInput: unknown): Promise<Result<SaveFileDialogResult>> => {
      const parseResult = saveFileInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        const res = await dialogService.saveFile(parseResult.data);
        return successResult(res);
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER,
    async (_event, rawInput: unknown): Promise<Result<{ success: boolean }>> => {
      const parseResult = showItemInFolderInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        await dialogService.showItemInFolder(parseResult.data.path);
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
