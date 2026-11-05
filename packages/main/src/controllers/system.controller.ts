import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@app/shared/constants/preferences';
import type { Result } from '@app/shared/types/result';
import type { PingResult, SystemInfo } from '@app/shared/types/system';
import { getTrayManager } from '../modules/tray.module';
import { systemService } from '../services/system.service';
import { handleTraced } from '../telemetry/ipc-tracer';
import { catchToResult, failResult, successResult } from './utils';

function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

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

  // RM-13：应用内切换语言后立即重建托盘菜单与通知文案，不重启
  handleTraced(
    IPC_CHANNELS.SYSTEM_SET_LOCALE,
    async (_event, locale: unknown): Promise<Result<{ success: boolean }>> => {
      if (!isSupportedLocale(locale)) {
        return failResult('locale must be one of zh-CN | en');
      }
      getTrayManager().setLocale(locale);
      return successResult({ success: true });
    },
  );
}
