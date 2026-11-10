import { SettingsCard } from './components/SettingsCard';
import { useAppConfig } from './hooks/useAppConfig';

// 私有常量

// 可抽离的逻辑处理函数/组件
/**
 * 偏好设置域入口（feature 唯一公开面）。
 */
function SettingsFeature() {
  // 变量声明、解构
  const { appConfig, isLoading, handleUpdateConfig, handleResetConfig } = useAppConfig();

  // 组件渲染
  return (
    <SettingsCard
      appConfig={appConfig}
      onUpdate={handleUpdateConfig}
      onReset={handleResetConfig}
      isLoading={isLoading}
    />
  );
}

export { SettingsFeature };
export default SettingsFeature;
