import { SystemInfoCard } from './components/SystemInfoCard';
import { useSystemInfo } from './hooks/useSystemInfo';

// 私有常量

// 可抽离的逻辑处理函数/组件
/**
 * 系统信息域入口（feature 唯一公开面）。Ping 已拆为平级的 ping 域（见 README「Feature 规范 4」）。
 */
function SystemInfoFeature() {
  // 变量声明、解构
  const { systemInfo, isFetchingInfo } = useSystemInfo();

  // 组件渲染
  return <SystemInfoCard systemInfo={systemInfo} isLoading={isFetchingInfo} />;
}

export { SystemInfoFeature };
export default SystemInfoFeature;
