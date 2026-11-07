import { CalculatorCard } from './components/CalculatorCard';
import { useCalculator } from './hooks/useCalculator';

// 私有常量

// 可抽离的逻辑处理函数/组件
/**
 * 安全计算器域入口（feature 唯一公开面）。
 */
function CalculatorFeature() {
  // 变量声明、解构
  const { a, b, op, result, error, isLoading, setA, setB, setOp, calculate } = useCalculator();

  // 组件渲染
  return (
    <CalculatorCard
      a={a}
      b={b}
      op={op}
      onAChange={setA}
      onBChange={setB}
      onOpChange={setOp}
      result={result}
      error={error}
      isLoading={isLoading}
      onCalculate={calculate}
    />
  );
}

export { CalculatorFeature };
export default CalculatorFeature;
