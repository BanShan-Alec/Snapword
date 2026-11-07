import { ApiOutlined, ReloadOutlined, UsbOutlined } from '@ant-design/icons';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import type { UsbDeviceItem } from '@shared/types/usb';
import { Badge, Button, Empty, Skeleton, Tag } from 'antd';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AppCard } from '@/components/ui/AppCard';
import { CardTitle } from '@/components/ui/CardTitle';
import { getScrollFadeState } from './lib/scrollFade';

const _UsbCard = (props: UsbCardProps) => {
  useLingui();
  const { devices, isLoading, onRefresh } = props;

  const showSkeleton = isLoading && devices.length === 0;
  const deviceListRef = useRef<HTMLDivElement>(null);
  const [scrollFadeState, setScrollFadeState] = useState({
    topOpacity: 0,
    bottomOpacity: 0,
  });
  const { topOpacity, bottomOpacity } = scrollFadeState;

  const updateScrollState = useCallback(() => {
    const element = deviceListRef.current;
    if (!element) {
      setScrollFadeState({ topOpacity: 0, bottomOpacity: 0 });
      return;
    }

    // scroll 事件按帧触发：同值返回 prev，避免滚动与 ResizeObserver 回调造成无效重渲染
    setScrollFadeState((prev) => {
      const next = getScrollFadeState(element);
      return prev.topOpacity === next.topOpacity && prev.bottomOpacity === next.bottomOpacity
        ? prev
        : next;
    });
  }, []);

  useEffect(() => {
    updateScrollState();
    const element = deviceListRef.current;
    if (!element) return;

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
  }, [updateScrollState, devices]);

  return (
    <AppCard
      title={
        <CardTitle
          icon={<UsbOutlined />}
          title={t`USB 硬件设备监控`}
          subtitle={t`基于 C++ 原生库 node-usb 探针`}
        />
      }
      extra={
        <div className="flex items-center gap-2">
          <Badge count={devices.length} overflowCount={99} color="var(--color-success)" />
          <Button size="small" icon={<ReloadOutlined />} loading={isLoading} onClick={onRefresh}>
            {t`刷新`}
          </Button>
        </div>
      }
    >
      {showSkeleton ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <div className="relative">
          <div
            ref={deviceListRef}
            onScroll={updateScrollState}
            className="flex flex-col gap-2.5 max-h-80 overflow-y-auto pr-1"
          >
            {devices.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t`未检测到连接的 USB 设备`}
              />
            ) : (
              devices.map((device) => {
                const { manufacturerName } = device;
                const displayName =
                  device.productName ||
                  (manufacturerName ? t`${manufacturerName} 设备` : t`未知 USB 设备`);
                const deviceKey =
                  device.serialNumber ||
                  `${device.vendorIdHex}-${device.productIdHex}-${device.deviceClass}-${device.deviceSubClass ?? 0}-${device.deviceProtocol ?? 0}`;

                return (
                  <div
                    key={deviceKey}
                    className="bg-background-sunken p-2.5 rounded-lg border border-border/60 flex items-center justify-between gap-3 text-xs select-text"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <ApiOutlined />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground truncate">{displayName}</div>
                        {device.manufacturerName && device.productName && (
                          <div className="text-xs text-foreground-secondary truncate">
                            {device.manufacturerName}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 font-mono">
                      <Tag color="blue" className="mr-0 text-xs">
                        VID: {device.vendorIdHex}
                      </Tag>
                      <Tag color="cyan" className="mr-0 text-xs">
                        PID: {device.productIdHex}
                      </Tag>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div
            className="usb-scroll-fade usb-scroll-fade-top"
            style={{ opacity: topOpacity }}
            aria-hidden="true"
          />
          <div
            className="usb-scroll-fade usb-scroll-fade-bottom"
            style={{ opacity: bottomOpacity }}
            aria-hidden="true"
          />
        </div>
      )}
    </AppCard>
  );
};

// props 类型定义
export interface UsbCardProps {
  devices: UsbDeviceItem[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const UsbCard = memo(_UsbCard);
