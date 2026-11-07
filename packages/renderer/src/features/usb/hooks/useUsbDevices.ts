import { t } from '@lingui/core/macro';
import { App } from 'antd';
import { useEffect } from 'react';
import { useIpc } from '@/hooks/useIpc';

/**
 * USB 设备监控 Hook：初次挂载自动拉取 + 手动刷新
 */
export function useUsbDevices() {
  const { message } = App.useApp();

  const {
    data: devices,
    loading: isLoading,
    refresh: fetchDevices,
    run: fetchDevicesRun,
  } = useIpc('usb.getDeviceList', {
    onError: (err) => {
      const isDescriptorError = /getString error|error 31/i.test(err.message);
      const detail = err.message;
      const tip = isDescriptorError
        ? t`无法读取部分 USB 设备描述符，请检查设备连接或系统权限`
        : t`获取 USB 设备列表失败: ${detail}`;
      message.error(tip);
    },
  });

  // 组件Effect：初次挂载拉取（fetchDevicesRun 来自 ahooks useRequest，经 useMemoizedFn 包装引用永久恒定）
  useEffect(() => {
    fetchDevicesRun();
  }, [fetchDevicesRun]);

  return {
    devices: devices ?? [],
    isLoading,
    fetchDevices,
  };
}
