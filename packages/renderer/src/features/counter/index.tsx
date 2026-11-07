import { CounterCard } from './components/CounterCard';
import { useCounter } from './hooks/useCounter';

// 私有常量

// 可抽离的逻辑处理函数/组件
/**
 * 计数器域入口（feature 唯一公开面）：自行持有 hook 并渲染卡片，壳层只负责摆放。
 */
function CounterFeature() {
  // 变量声明、解构
  const { count, step, setStep, isUpdating, handleIncrement, handleDecrement, handleReset } =
    useCounter();

  // 组件渲染
  return (
    <CounterCard
      count={count}
      step={step}
      onStepChange={setStep}
      isUpdating={isUpdating}
      onIncrement={handleIncrement}
      onDecrement={handleDecrement}
      onReset={handleReset}
    />
  );
}

export { CounterFeature };
