import { t } from '@lingui/core/macro';
import { useInterval } from 'ahooks';
import { App } from 'antd';
import { useEffect } from 'react';
import { useIpc } from '@/hooks/useIpc';

// 私有常量

// 可抽离的逻辑处理函数/组件

/**
 * 系统信息域：初次挂载拉取 + 1s 受控轮询（请求进行中时静默跳过防积压）。
 * useIpc 从契约路径推导 data 类型，无需手写 Result 解构与类型断言。
 */
export function useSystemInfo() {
  const { message } = App.useApp();

  // 网络IO（显式挂载触发）—— 初次拉取与静默成功轮询
  const {
    data: systemInfo,
    loading: isFetchingInfo,
    run: fetchSystemInfo,
  } = useIpc('system.getSystemInfo', {
    recordSuccess: false,
    onError: (err) => {
      const detail = err.message;
      message.error(t`获取系统信息失败: ${detail}`);
    },
  });

  // 组件Effect：初次挂载拉取（fetchSystemInfo 来自 ahooks useRequest，经 useMemoizedFn 包装引用永久恒定）
  useEffect(() => {
    fetchSystemInfo();
  }, [fetchSystemInfo]);

  // 周期轮询：上一轮仍在进行中时静默跳过，天然防积压
  useInterval(() => {
    if (!isFetchingInfo) {
      fetchSystemInfo();
    }
  }, 1000);

  return {
    systemInfo: systemInfo ?? null,
    isFetchingInfo,
  };
}
