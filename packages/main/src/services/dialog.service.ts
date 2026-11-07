import fs from 'node:fs';
import { ErrorCode } from '@app/shared/constants/error-codes';
import type { OpenDirectoryInput, OpenFileInput, SaveFileInput } from '@app/shared/schemas/dialog';
import type { FileDialogResult, SaveFileDialogResult } from '@app/shared/types/dialog';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { AppError } from '../errors/AppError';

export class DialogService {
  async openFile(input?: OpenFileInput): Promise<FileDialogResult> {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const properties: ('openFile' | 'multiSelections')[] = ['openFile'];
    if (input?.multiSelections) {
      properties.push('multiSelections');
    }

    const result = await dialog.showOpenDialog(window, {
      title: input?.title,
      filters: input?.filters,
      properties,
    });

    return {
      canceled: result.canceled,
      filePaths: result.filePaths,
    };
  }

  async openDirectory(input?: OpenDirectoryInput): Promise<FileDialogResult> {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(window, {
      title: input?.title,
      properties: ['openDirectory'],
    });

    return {
      canceled: result.canceled,
      filePaths: result.filePaths,
    };
  }

  async saveFile(input?: SaveFileInput): Promise<SaveFileDialogResult> {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showSaveDialog(window, {
      title: input?.title,
      defaultPath: input?.defaultPath,
      filters: input?.filters,
    });

    if (!result.canceled && result.filePath) {
      const content = input?.content ?? `Hello from ${app.getName()}!\n`;
      await fs.promises.writeFile(result.filePath, content, 'utf-8');
    }

    return {
      canceled: result.canceled,
      filePath: result.filePath,
    };
  }

  async showItemInFolder(path: string): Promise<void> {
    if (!fs.existsSync(path)) {
      throw new AppError(`Target path does not exist: ${path}`, ErrorCode.NOT_FOUND);
    }
    shell.showItemInFolder(path);
  }
}

export const dialogService = new DialogService();
