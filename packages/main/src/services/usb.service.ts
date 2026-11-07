import type { UsbDeviceItem } from '@app/shared/types/usb';
import { usb as usbCore } from 'usb';
import { getLogManager } from '../modules/log.module';

function safeGet<T>(getter: () => T, fallback: T): T {
  try {
    return getter() ?? fallback;
  } catch {
    return fallback;
  }
}

export class UsbService {
  /**
   * 获取当前主机所有已连接的 USB 设备列表并映射为安全元数据
   */
  public async getDeviceList(): Promise<UsbDeviceItem[]> {
    let rawDevices: Awaited<ReturnType<typeof usbCore.getDevices>>;
    try {
      rawDevices = await usbCore.getDevices();
    } catch (err) {
      getLogManager()
        .scoped('UsbService')
        .warn('Failed to enumerate raw USB devices from bus:', err);
      return [];
    }

    return rawDevices.map((d) => {
      const vendorHex = `0x${d.vendorId.toString(16).padStart(4, '0')}`;
      const productHex = `0x${d.productId.toString(16).padStart(4, '0')}`;

      return {
        vendorIdHex: vendorHex,
        productIdHex: productHex,
        vendorId: d.vendorId,
        productId: d.productId,
        productName: safeGet(() => d.productName, null),
        manufacturerName: safeGet(() => d.manufacturerName, null),
        serialNumber: safeGet(() => d.serialNumber, null),
        deviceClass: d.deviceClass,
        deviceSubClass: d.deviceSubclass,
        deviceProtocol: d.deviceProtocol,
      };
    });
  }
}

export const usbService = new UsbService();
