import { t } from '@lingui/core/macro';
import { App } from 'antd';
import { useEffect } from 'react';
import { useManualRequest } from '@/hooks/useManualRequest';
import { callIpc } from '@/lib/ipc';

// 私有常量
interface PingMeasurement {
  latency: number;
  serverTime: string;
}

// 可抽离的逻辑处理函数/组件
async function pingWithLatency(): Promise<PingMeasurement> {
  // 需要在 api 返回前后夹一段本地计时，故 service 自行拼装而非直接用 useIpc
  const start = performance.now();
  const data = await callIpc('system.ping');
  const latency = Math.round((performance.now() - start) * 10) / 10;
  return { latency, serverTime: data.serverTime };
}

/**
 * Ping 域：挂载即测，refresh 驱动手动重测；过期响应自动丢弃。
 */
export function usePing() {
  const { message } = App.useApp();

  // 网络IO（显式挂载触发）
  const {
    data: ping,
    loading: isPinging,
    refresh: handlePing,
    run: pingRun,
  } = useManualRequest(pingWithLatency, {
    onError: (err) => {
      const detail = err.message;
      message.error(t`Ping 失败: ${detail}`);
    },
  });

  // 组件Effect
  // 显式挂载触发：挂载即测一次（run 引用稳定，不会自触循环）
  useEffect(() => {
    pingRun();
  }, [pingRun]);

  return {
    pingLatency: ping?.latency ?? null,
    serverTime: ping?.serverTime ?? '',
    isPinging,
    handlePing,
  };
}
