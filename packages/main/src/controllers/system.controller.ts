import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import type { Result } from '@app/shared/types/result';
import type { PingResult, SystemInfo } from '@app/shared/types/system';
import { systemService } from '../services/system.service';
import { handleTraced } from '../telemetry/ipc-tracer';
import { catchToResult, successResult } from './utils';

export function registerSystemControllers(): void {
  handleTraced(IPC_CHANNELS.SYSTEM_PING, async (): Promise<Result<PingResult>> => {
    try {
      const data = systemService.getPing();
      return successResult(data);
    } catch (err) {
      return catchToResult(err);
    }
  });

  handleTraced(IPC_CHANNELS.SYSTEM_GET_INFO, async (): Promise<Result<SystemInfo>> => {
    try {
      const data = systemService.getSystemInfo();
      return successResult(data);
    } catch (err) {
      return catchToResult(err);
    }
  });
}
