import { t } from '@lingui/core/macro';
import type { CounterResult } from '@shared/types/counter';
import { App } from 'antd';
import { useEffect, useState } from 'react';
import { useManualRequest } from '@/hooks/useManualRequest';
import { callIpc } from '@/lib/ipc';

// 私有常量
type CounterAction = 'increment' | 'decrement' | 'reset';

// 可抽离的逻辑处理函数/组件
async function runCounterAction(action: CounterAction, step: number): Promise<CounterResult> {
  // 多 channel 编排：service 内部逐个 callIpc，保留统一解构与日志
  if (action === 'increment') {
    return callIpc('counter.increment', [{ step }]);
  }
  if (action === 'decrement') {
    return callIpc('counter.decrement', [{ step }]);
  }
  return callIpc('counter.reset');
}

export function useCounter() {
  const { message } = App.useApp();
  const [step, setStep] = useState<number>(1);

  // 网络IO（manual-only）—— 单一 useManualRequest 通道，触发点全部显式：
  // useEffect 内 run() 为挂载拉取，runCounterOp(action) 为用户操作。
  // 操作响应直接汇入同一份 data 驱动显示；ahooks 内建 take-latest 丢弃过期响应，连点不产生数据倒流。
  const {
    data: counter,
    loading,
    refresh: refreshCounter,
    run: fetchCounter,
    runAsync: runCounterOp,
  } = useManualRequest(
    async (action?: CounterAction): Promise<CounterResult> => {
      if (action) {
        return runCounterAction(action, step);
      }
      return callIpc('counter.get');
    },
    {
      onError: (err, [action]) => {
        const detail = err.message;
        message.error(action ? t`计数器操作失败: ${detail}` : t`读取计数器失败: ${detail}`);
      },
    },
  );

  // 组件Effect
  // 显式挂载触发：初次拉取（run 引用稳定，不会自触循环）
  useEffect(() => {
    fetchCounter();
  }, [fetchCounter]);

  // 数据转换
  // 已有数据后的 loading 才是操作在途；首次拉取期间不显示按钮加载态
  const isUpdating = loading && counter !== undefined;

  // 逻辑处理函数
  const handleIncrement = () => {
    void runCounterOp('increment').catch(() => {
      // 过期响应 CancelledError 与业务异常均已丢弃/提示，此处防止未处理拒绝
    });
  };

  const handleDecrement = () => {
    void runCounterOp('decrement').catch(() => {});
  };

  const handleReset = () => {
    void runCounterOp('reset').catch(() => {});
  };

  return {
    count: counter?.count ?? 0,
    step,
    setStep,
    isUpdating,
    handleIncrement,
    handleDecrement,
    handleReset,
    refreshCounter,
  };
}
