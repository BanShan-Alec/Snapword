import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import type { Result } from '@app/shared/types/result';
import type { PingResult, SystemInfo } from '@app/shared/types/system';
import { ipcMain } from 'electron';
import { systemService } from '../services/system.service';
import { catchToResult, successResult } from './utils';

export function registerSystemControllers(): void {
  ipcMain.handle(IPC_CHANNELS.SYSTEM_PING, async (): Promise<Result<PingResult>> => {
    try {
      const data = systemService.getPing();
      return successResult(data);
    } catch (err) {
      return catchToResult(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_INFO, async (): Promise<Result<SystemInfo>> => {
    try {
      const data = systemService.getSystemInfo();
      return successResult(data);
    } catch (err) {
      return catchToResult(err);
    }
  });
}
