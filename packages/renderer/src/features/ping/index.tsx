import { PingCard } from './components/PingCard';
import { usePing } from './hooks/usePing';

// 私有常量

// 可抽离的逻辑处理函数/组件
/**
 * Ping 域入口（feature 唯一公开面）。与 system-info 平级：两者零共享 state（见 README「Feature 规范 4」）。
 */
function PingFeature() {
  // 变量声明、解构
  const { pingLatency, serverTime, isPinging, handlePing } = usePing();

  // 组件渲染
  return (
    <PingCard
      latency={pingLatency}
      serverTime={serverTime}
      isPinging={isPinging}
      onPing={handlePing}
    />
  );
}

export { PingFeature };
export default PingFeature;
