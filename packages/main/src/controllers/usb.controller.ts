import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import type { Result } from '@app/shared/types/result';
import type { UsbDeviceItem } from '@app/shared/types/usb';
import { usbService } from '../services/usb.service';
import { handleTraced } from '../telemetry/ipc-tracer';
import { catchToResult, successResult } from './utils';

export function registerUsbControllers(): void {
  handleTraced(IPC_CHANNELS.USB_GET_DEVICE_LIST, async (): Promise<Result<UsbDeviceItem[]>> => {
    try {
      const data = await usbService.getDeviceList();
      return successResult(data);
    } catch (err) {
      return catchToResult(err);
    }
  });
}
