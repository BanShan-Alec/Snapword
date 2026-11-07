import { DevToolsCard } from './components/DevToolsCard';
import { useDevTools } from './hooks/useDevTools';

// 私有常量

// 可抽离的逻辑处理函数/组件
/**
 * 开发者工具域入口（feature 唯一公开面）。与 logging 平级（见 README「Feature 规范 4」）。
 */
function DevToolsFeature() {
  // 变量声明、解构
  const {
    actionMessage,
    handleToggleDevTools,
    handleOpenDocs,
    handleOpenGithub,
    handleOpenBlockedUrl,
  } = useDevTools();

  // 组件渲染
  return (
    <DevToolsCard
      actionMessage={actionMessage}
      onToggleDevTools={handleToggleDevTools}
      onOpenDocs={handleOpenDocs}
      onOpenGithub={handleOpenGithub}
      onOpenBlockedUrl={handleOpenBlockedUrl}
    />
  );
}

export { DevToolsFeature };
export default DevToolsFeature;
