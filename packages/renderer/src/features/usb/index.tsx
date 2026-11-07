import { UsbCard } from './components/UsbCard';
import { useUsbDevices } from './hooks/useUsbDevices';

/**
 * USB 硬件监控域入口（Feature 唯一公开面）
 */
function UsbFeature() {
  const { devices, isLoading, fetchDevices } = useUsbDevices();

  return <UsbCard devices={devices} isLoading={isLoading} onRefresh={fetchDevices} />;
}

export { UsbFeature };
export default UsbFeature;
