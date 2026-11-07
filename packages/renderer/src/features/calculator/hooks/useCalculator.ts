import { t } from '@lingui/core/macro';
import type { CalcOperator } from '@shared/types/calculator';
import { App } from 'antd';
import { useState } from 'react';
import { useIpc } from '@/hooks/useIpc';

// 私有常量
const DEFAULT_OPERAND_A = 10;
const DEFAULT_OPERAND_B = 2;
const DEFAULT_OPERATOR: CalcOperator = 'divide';

// 可抽离的逻辑处理函数/组件

export function useCalculator() {
  const { message } = App.useApp();
  const [a, setA] = useState<number>(DEFAULT_OPERAND_A);
  const [b, setB] = useState<number>(DEFAULT_OPERAND_B);
  const [op, setOp] = useState<CalcOperator>(DEFAULT_OPERATOR);

  // 网络IO（显式触发）—— 用户点击触发的 IPC 计算（过期响应自动丢弃）
  // useIpc 从 api 函数签名推导 data 类型，无需手写 Result 解构与类型断言
  const {
    data: result,
    error,
    loading: isLoading,
    runAsync: calculateAsync,
  } = useIpc('calculator.calculate', {
    onError: (err) => {
      const detail = err.message;
      message.error(t`计算失败: ${detail}`);
    },
    onSuccess: () => {
      // 用户动作只记结果：操作数与结果不入日志（payload 纪律）
      logger.info('Calculation completed');
    },
  });

  // 逻辑处理函数
  const calculate = () => {
    void calculateAsync({ a, b, op }).catch(() => {
      // 过期响应 CancelledError 与业务异常均已丢弃/提示，此处防止未处理拒绝
    });
  };

  return {
    a,
    setA,
    b,
    setB,
    op,
    setOp,
    result: result?.result ?? null,
    error: error?.message ?? null,
    isLoading,
    calculate,
  };
}
