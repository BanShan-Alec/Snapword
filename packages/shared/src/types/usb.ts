/**
 * USB 设备描述符与标准化硬件元数据
 */
export interface UsbDeviceItem {
  /** 厂商 ID (16 进制字符串，如 '0x1532') */
  vendorIdHex: string;
  /** 产品 ID (16 进制字符串，如 '0x0083') */
  productIdHex: string;
  /** 原始十进制 Vendor ID */
  vendorId: number;
  /** 原始十进制 Product ID */
  productId: number;
  /** 产品名称（如有） */
  productName: string | null;
  /** 制造商名称（如有） */
  manufacturerName: string | null;
  /** 序列号（如有） */
  serialNumber: string | null;
  /** 设备类别代码 (Device Class) */
  deviceClass: number;
  /** 设备子类别代码 */
  deviceSubClass?: number;
  /** 设备协议代码 */
  deviceProtocol?: number;
}
