import { CalculatorOutlined, MinusOutlined, PlusOutlined, RedoOutlined } from '@ant-design/icons';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Button, Select } from 'antd';
import { memo } from 'react';
import { AppCard } from '@/components/ui/AppCard';
import { CardTitle } from '@/components/ui/CardTitle';

// 私有常量
const STEP_OPTIONS = [1, 5, 10, 50];

// 可抽离的逻辑处理函数/组件
function toSelectOptions(steps: number[]) {
  return steps.map((step) => ({ label: String(step), value: step }));
}

const _CounterCard = (props: CounterCardProps) => {
  useLingui();
  // 变量声明、解构
  const { count, step, onStepChange, isUpdating, onIncrement, onDecrement, onReset } = props;

  // 组件状态

  // 网络IO

  // 数据转换
  const selectOptions = toSelectOptions(STEP_OPTIONS);

  // 逻辑处理函数

  // 组件Effect

  // 组件渲染
  return (
    <AppCard
      title={
        <CardTitle
          icon={<CalculatorOutlined />}
          title={t`IPC 计数器 (Counter)`}
          subtitle={t`基于主进程状态原子操作与响应式更新`}
        />
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center p-4 bg-background-sunken rounded-lg border border-border gap-4">
        <div className="flex flex-col items-center">
          <span className="text-xs text-foreground-secondary font-medium">{t`当前持久化数值`}</span>
          <span className="text-4xl font-semibold text-primary font-mono mt-1">{count}</span>
        </div>

        <div className="flex items-center gap-2 w-full max-w-xs">
          <label
            htmlFor="step-select"
            className="text-xs text-foreground-secondary whitespace-nowrap"
          >
            {t`步长:`}
          </label>
          <Select
            id="step-select"
            className="flex-1"
            value={step}
            options={selectOptions}
            onChange={onStepChange}
          />
        </div>

        <div className="flex items-center gap-2.5 w-full justify-center">
          <Button size="small" icon={<MinusOutlined />} loading={isUpdating} onClick={onDecrement}>
            {t`递减 (-1)`}
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            loading={isUpdating}
            onClick={onIncrement}
          >
            {t`递增 (+1)`}
          </Button>
          <Button size="small" icon={<RedoOutlined />} loading={isUpdating} onClick={onReset}>
            {t`重置为 0`}
          </Button>
        </div>
      </div>
    </AppCard>
  );
};

// props 类型定义
interface CounterCardProps {
  count: number;
  step: number;
  onStepChange: (step: number) => void;
  isUpdating: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
  onReset: () => void;
}

export const CounterCard = memo(_CounterCard);
