import { FunctionOutlined } from '@ant-design/icons';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import type { CalcOperator } from '@shared/types/calculator';
import { Alert, Button, Input, Select, Tag } from 'antd';
import { memo } from 'react';
import { AppCard } from '@/components/ui/AppCard';
import { CardTitle } from '@/components/ui/CardTitle';

// 私有常量
const OPERATOR_OPTIONS: { label: string; value: CalcOperator }[] = [
  { label: '+', value: 'add' },
  { label: '-', value: 'subtract' },
  { label: '×', value: 'multiply' },
  { label: '÷', value: 'divide' },
];

// 可抽离的逻辑处理函数/组件

const _CalculatorCard = (props: CalculatorCardProps) => {
  useLingui();
  // 变量声明、解构
  const { a, b, op, onAChange, onBChange, onOpChange, result, error, isLoading, onCalculate } =
    props;

  // 组件状态

  // 网络IO

  // 数据转换

  // 逻辑处理函数

  // 组件Effect

  // 组件渲染
  return (
    <AppCard
      title={
        <CardTitle
          icon={<FunctionOutlined />}
          title={t`安全计算器 (IPC 错误处理)`}
          subtitle={t`Zod 严格模式入参校验与语义化错误码 Result 契约`}
        />
      }
    >
      <div className="flex flex-1 flex-col justify-between gap-3">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={a}
            onChange={(e) => onAChange(Number(e.target.value))}
            placeholder={t`操作数 A`}
            className="font-mono text-center"
          />

          <Select
            value={op}
            options={OPERATOR_OPTIONS}
            onChange={onOpChange}
            className="font-mono font-semibold"
          />

          <Input
            type="number"
            value={b}
            onChange={(e) => onBChange(Number(e.target.value))}
            placeholder={t`操作数 B`}
            className="font-mono text-center"
          />

          <Button type="primary" loading={isLoading} onClick={onCalculate}>
            =
          </Button>
        </div>

        {result !== null && (
          <div className="p-3 bg-success/10 border border-success/30 rounded-lg flex items-center justify-between">
            <span className="text-xs text-foreground-secondary font-medium">{t`计算结果:`}</span>
            <span className="text-base font-semibold text-foreground font-mono">{result}</span>
          </div>
        )}

        {error && <Alert type="error" showIcon title={error} />}

        <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-foreground-secondary mt-1 pt-2 border-t border-border/40">
          <span>{t`提示：尝试输入 B = 0 并选择除法 (÷) 触发服务端异常拦截`}</span>
          <Tag>{t`Zod 校验`}</Tag>
        </div>
      </div>
    </AppCard>
  );
};

// props 类型定义
interface CalculatorCardProps {
  a: number;
  b: number;
  op: CalcOperator;
  onAChange: (val: number) => void;
  onBChange: (val: number) => void;
  onOpChange: (op: CalcOperator) => void;
  result: number | null;
  error: string | null;
  isLoading: boolean;
  onCalculate: () => void;
}

export const CalculatorCard = memo(_CalculatorCard);
